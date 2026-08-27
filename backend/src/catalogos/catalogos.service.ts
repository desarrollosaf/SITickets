import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import { dominioInstitucional } from '../common/correo';
import {
  Area,
  CatalogoProblema,
  Dependencia,
  Estatus,
  MotivoReasignacion,
  Prioridad,
  Sede,
  Servicio,
  ServicioUsuarioPermitido,
  SUsuario,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { ActualizarProblemaDto, CrearProblemaDto } from './dto/catalogo-problema.dto';
import { ActualizarPrioridadDto } from './dto/prioridad.dto';
import { AgregarUsuarioPermitidoDto, ActualizarServicioDto, CrearServicioDto } from './dto/servicio.dto';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

/**
 * Otra excepcion puntual: esta gente nunca registra "a nombre de otro" sin
 * importar el servicio — el ticket siempre queda a su propio nombre, aunque
 * su rol (gestor, en este caso) normalmente si tendria esa opcion.
 */
export const RFC_SIEMPRE_A_NOMBRE_PROPIO = ['TOMJ820727', 'NATL830315', 'CACX680312'];

@Injectable()
export class CatalogosService {
  constructor(
    @InjectModel(Servicio) private readonly servicios: typeof Servicio,
    @InjectModel(CatalogoProblema) private readonly problemasM: typeof CatalogoProblema,
    @InjectModel(Prioridad) private readonly prioridades: typeof Prioridad,
    @InjectModel(Estatus) private readonly estatus: typeof Estatus,
    @InjectModel(MotivoReasignacion) private readonly motivos: typeof MotivoReasignacion,
    @InjectModel(Dependencia) private readonly dependencias: typeof Dependencia,
    @InjectModel(Area) private readonly areas: typeof Area,
    @InjectModel(Sede) private readonly sedes: typeof Sede,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(ServicioUsuarioPermitido)
    private readonly permitidos: typeof ServicioUsuarioPermitido,
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
    private readonly config: ConfigService,
  ) {}

  async organizacion() {
    const [dependencias, areas] = await Promise.all([
      this.dependencias.findAll({
        where: { activo: true },
        attributes: ['id', 'nombre'],
        order: [['nombre', 'ASC']],
      }),
      this.areas.findAll({
        where: { activo: true },
        attributes: ['id', 'nombre', 'dependencia_id'],
        order: [['nombre', 'ASC']],
      }),
    ]);
    return { dependencias, areas };
  }

  async todo(usuario: UsuarioToken) {
    const [servicios, problemas, prioridades, estatus, motivos, sedes] = await Promise.all([
      this.servicios.findAll({
        where: { activo: true },
        order: [
          ['origen', 'ASC'],
          ['nombre', 'ASC'],
        ],
      }),
      this.problemas(),
      this.prioridades.findAll({ order: [['orden', 'ASC']] }),
      this.estatus.findAll({ order: [['orden', 'ASC']] }),
      this.motivos.findAll({ where: { activo: true }, order: [['id', 'ASC']] }),
      this.sedes.findAll({ where: { activo: true }, attributes: ['id', 'nombre', 'radio_m'] }),
    ]);
    /*
     * El dominio viaja con los catalogos para que el formulario valide la
     * cuenta de correo contra el mismo valor que exige el backend. Si el area
     * lo cambia basta reiniciar el API: el front no se recompila.
     */
    const correo_dominio = dominioInstitucional(this.config.get('CORREO_DOMINIO'));

    /*
     * puedeRegistrar: solo importa para los servicios con restringido=true
     * (ver ServicioUsuarioPermitido); el resto siempre viene en true. No se
     * ocultan del catalogo (otras pantallas, como el filtro de "Todos los
     * tickets", siguen necesitando verlos todos) — solo el formulario de
     * alta lo usa para no ofrecerlos a quien no puede elegirlos.
     */
    const restringidos = servicios.filter((s) => s.restringido);
    const rfc = await this.rfcDe(usuario);
    const permitidosPorServicio = restringidos.length
      ? await this.permitidos.findAll({
          where: { servicio_id: restringidos.map((s) => s.id) },
          attributes: ['servicio_id', 'rfc'],
        })
      : [];
    const mapaPermitidos = new Map<number, Set<string>>();
    for (const p of permitidosPorServicio) {
      if (!mapaPermitidos.has(p.servicio_id)) mapaPermitidos.set(p.servicio_id, new Set());
      mapaPermitidos.get(p.servicio_id)!.add(p.rfc);
    }
    const serviciosConPermiso = servicios.map((s) => {
      const puedeRegistrar =
        !s.restringido ||
        usuario.rol === 'admin' ||
        (!!rfc && !!mapaPermitidos.get(s.id)?.has(rfc));
      return { ...s.toJSON(), puedeRegistrar };
    });

    return {
      servicios: serviciosConPermiso,
      problemas,
      prioridades,
      estatus,
      motivos,
      sedes,
      correo_dominio,
    };
  }

  async problemas(origen?: 'usuario' | 'administrador') {
    const filas = await this.problemasM.findAll({
      where: { activo: true },
      include: [
        {
          model: Servicio,
          as: 'servicio',
          where: { activo: true, ...(origen ? { origen } : {}) },
          required: true,
        },
      ],
      order: [
        [{ model: Servicio, as: 'servicio' }, 'nombre', 'ASC'],
        ['orden', 'ASC'],
      ],
    });

    return filas.map((p) => this.mapaProblema(p));
  }

  private mapaProblema(p: CatalogoProblema) {
    return {
      id: p.id,
      clave: p.clave,
      descripcion: p.descripcion,
      prioridad: p.prioridad,
      campo_adicional: p.campo_adicional,
      requiere_texto: p.requiere_texto,
      orden: p.orden,
      activo: p.activo,
      servicio_id: p.servicio_id,
      servicio: p.servicio.nombre,
      servicio_clave: p.servicio.clave,
      origen: p.servicio.origen,
    };
  }

  /** Todas las opciones (activas e inactivas): lo que necesita el admin para administrarlas. */
  async problemasAdmin() {
    const filas = await this.problemasM.findAll({
      include: [{ model: Servicio, as: 'servicio', required: true }],
      order: [
        [{ model: Servicio, as: 'servicio' }, 'nombre', 'ASC'],
        ['orden', 'ASC'],
      ],
    });
    return filas.map((p) => this.mapaProblema(p));
  }

  async crearProblema(dto: CrearProblemaDto) {
    const servicio = await this.servicios.findByPk(dto.servicio_id);
    if (!servicio) throw new BadRequestException('El servicio no existe');

    try {
      const creado = await this.problemasM.create({
        servicio_id: dto.servicio_id,
        clave: dto.clave.trim().toUpperCase(),
        descripcion: dto.descripcion.trim(),
        prioridad: dto.prioridad,
        campo_adicional: dto.campo_adicional?.trim() || null,
        requiere_texto: dto.requiere_texto ?? false,
        orden: dto.orden ?? 0,
      });
      return this.unaProblema(creado.id);
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ya existe una opcion con esa clave');
      }
      throw e;
    }
  }

  /** Alta de un nuevo tipo de servicio. Nace activo; el resto de banderas por defecto en false. */
  async crearServicio(dto: CrearServicioDto) {
    try {
      return await this.servicios.create({
        clave: dto.clave.trim().toUpperCase(),
        nombre: dto.nombre.trim(),
        prefijo_folio: dto.prefijo_folio.trim().toUpperCase(),
        origen: dto.origen,
        externo: dto.externo ?? false,
        multi_tecnico: dto.multi_tecnico ?? false,
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ya existe un servicio con esa clave');
      }
      throw e;
    }
  }

  /**
   * Edicion de un servicio ya existente. La clave queda fuera: varios lugares
   * del backend la usan como identificador fijo (CMP, CAM-01, SIS...), asi
   * que cambiarla ahi rompe esos flujos sin que nada lo avise.
   */
  async actualizarServicio(id: number, dto: ActualizarServicioDto) {
    const servicio = await this.servicios.findByPk(id);
    if (!servicio) throw new NotFoundException('El servicio no existe');

    try {
      await servicio.update({
        ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
        ...(dto.prefijo_folio !== undefined && {
          prefijo_folio: dto.prefijo_folio.trim().toUpperCase(),
        }),
        ...(dto.origen !== undefined && { origen: dto.origen }),
        ...(dto.externo !== undefined && { externo: dto.externo }),
        ...(dto.multi_tecnico !== undefined && { multi_tecnico: dto.multi_tecnico }),
        ...(dto.restringido !== undefined && { restringido: dto.restringido }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ya existe un servicio con esos datos');
      }
      throw e;
    }
    return servicio;
  }

  /** Quien puede registrar tickets de un servicio con restringido=true. */
  async usuariosPermitidos(servicioId: number) {
    const servicio = await this.servicios.findByPk(servicioId);
    if (!servicio) throw new NotFoundException('El servicio no existe');
    return this.permitidos.findAll({
      where: { servicio_id: servicioId },
      order: [['nombre', 'ASC']],
    });
  }

  /** Se busca en saf (mismo padron que "a nombre de otro") y se guarda su rfc y nombre tal cual. */
  async agregarUsuarioPermitido(servicioId: number, dto: AgregarUsuarioPermitidoDto) {
    const servicio = await this.servicios.findByPk(servicioId);
    if (!servicio) throw new NotFoundException('El servicio no existe');

    const sUsuario = await this.sUsuarios.findByPk(dto.id_usuario_saf);
    if (!sUsuario || sUsuario.Estado !== 1) {
      throw new BadRequestException('Ese usuario no existe o ya no esta activo en saf');
    }

    try {
      return await this.permitidos.create({
        servicio_id: servicioId,
        rfc: sUsuario.N_Usuario,
        nombre: sUsuario.Nombre,
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ese usuario ya esta en la lista de este servicio');
      }
      throw e;
    }
  }

  async quitarUsuarioPermitido(servicioId: number, id: number) {
    const fila = await this.permitidos.findOne({ where: { id, servicio_id: servicioId } });
    if (!fila) throw new NotFoundException('Ese registro no existe');
    await fila.destroy();
    return { ok: true };
  }

  /** Rfc de quien llama, sea personal local o solicitante externo (saf); null si no aplica. */
  private async rfcDe(usuario: UsuarioToken): Promise<string | null> {
    if (usuario.rol === 'admin') return null;
    const local = await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] });
    if (local?.rfc) return local.rfc;
    const externo = await this.sUsuarios.findByPk(usuario.id);
    return externo?.N_Usuario ?? null;
  }

  async actualizarProblema(id: number, dto: ActualizarProblemaDto) {
    const problema = await this.problemasM.findByPk(id);
    if (!problema) throw new NotFoundException('La opcion no existe');

    if (dto.servicio_id !== undefined) {
      const servicio = await this.servicios.findByPk(dto.servicio_id);
      if (!servicio) throw new BadRequestException('El servicio no existe');
    }

    try {
      await problema.update({
        ...(dto.servicio_id !== undefined && { servicio_id: dto.servicio_id }),
        ...(dto.clave !== undefined && { clave: dto.clave.trim().toUpperCase() }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion.trim() }),
        ...(dto.prioridad !== undefined && { prioridad: dto.prioridad }),
        ...(dto.campo_adicional !== undefined && {
          campo_adicional: dto.campo_adicional?.trim() || null,
        }),
        ...(dto.requiere_texto !== undefined && { requiere_texto: dto.requiere_texto }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ya existe una opcion con esa clave');
      }
      throw e;
    }
    return this.unaProblema(id);
  }

  private async unaProblema(id: number) {
    const p = await this.problemasM.findByPk(id, {
      include: [{ model: Servicio, as: 'servicio', required: true }],
    });
    return this.mapaProblema(p!);
  }

  /**
   * P1-P4 son fijas (son la clave primaria y varias reglas del sistema
   * las dan por hecho); solo se ajustan nombre y tiempos objetivo.
   */
  async actualizarPrioridad(clave: string, dto: ActualizarPrioridadDto) {
    const prioridad = await this.prioridades.findByPk(clave);
    if (!prioridad) throw new NotFoundException('Esa prioridad no existe');

    await prioridad.update({
      ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
      ...(dto.minutos_respuesta !== undefined && { minutos_respuesta: dto.minutos_respuesta }),
      ...(dto.minutos_resolucion !== undefined && { minutos_resolucion: dto.minutos_resolucion }),
    });
    return prioridad;
  }

  /** Padron con especialidad. Nunca incluye el hash de contrasena. */
  async tecnicos() {
    const filas = await this.usuarios.findAll({
      where: { activo: true, rol: { [Op.in]: ['tecnico', 'proveedor', 'jefe'] } },
      attributes: ['id', 'nombre', 'rol'],
      include: [
        {
          model: TecnicoServicio,
          include: [{ model: Servicio, attributes: ['id', 'clave', 'nombre'] }],
        },
      ],
      order: [
        ['rol', 'ASC'],
        ['nombre', 'ASC'],
      ],
    });

    return filas.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      rol: u.rol,
      servicios: (u.especialidades ?? []).map((e) => ({
        id: e.servicio_id,
        nombre: e.servicio?.nombre ?? '—',
        suplente: e.suplente,
      })),
    }));
  }
}
