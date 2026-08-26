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
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { ActualizarProblemaDto, CrearProblemaDto } from './dto/catalogo-problema.dto';
import { ActualizarPrioridadDto } from './dto/prioridad.dto';
import { CrearServicioDto } from './dto/servicio.dto';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

/**
 * Excepcion puntual, no un mecanismo general: estos dos servicios solo los
 * puede registrar la gente listada aqui (mas el administrador, siempre). Si
 * en el futuro se necesita esto para mas servicios vale la pena convertirlo
 * en una tabla; por ahora son casos unicos y esta lista basta.
 */
export const RESTRICCION_SERVICIO: Record<string, string[]> = {
  'CAM-01': ['TOMJ820727', 'NATL830315'],
  SIS: ['CACX680312'],
};

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
     * puedeRegistrar: solo importa para los pocos servicios en
     * RESTRICCION_SERVICIO (ver arriba); el resto siempre viene en true. No
     * se ocultan del catalogo (otras pantallas, como el filtro de "Todos los
     * tickets", siguen necesitando verlos todos) — solo el formulario de
     * alta lo usa para no ofrecerlos a quien no puede elegirlos.
     */
    const rfc =
      usuario.rol === 'admin'
        ? null
        : ((await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] }))?.rfc ?? null);
    const serviciosConPermiso = servicios.map((s) => {
      const permitidos = RESTRICCION_SERVICIO[s.clave];
      const puedeRegistrar = !permitidos || usuario.rol === 'admin' || (!!rfc && permitidos.includes(rfc));
      /* restringido: el formulario de alta lo usa para saber que, aqui, ni
         admin/operador/gestor pueden registrar "a nombre de otro". */
      return { ...s.toJSON(), puedeRegistrar, restringido: !!permitidos };
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
