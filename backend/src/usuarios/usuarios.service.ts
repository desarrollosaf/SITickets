import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import {
  Area,
  CatalogoRol,
  Dependencia,
  DependenciaValidador,
  SDependencia,
  Servicio,
  SUsuario,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(Dependencia) private readonly dependencias: typeof Dependencia,
    @InjectModel(Servicio) private readonly servicios: typeof Servicio,
    @InjectModel(TecnicoServicio) private readonly tecnicoServicio: typeof TecnicoServicio,
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
    @InjectModel(SDependencia, 'saf') private readonly sDependencias: typeof SDependencia,
    @InjectModel(CatalogoRol) private readonly roles: typeof CatalogoRol,
    @InjectModel(DependenciaValidador) private readonly validadores: typeof DependenciaValidador,
  ) {}

  /**
   * El rol ya no es un ENUM cerrado en codigo (ver CatalogoRol): se valida
   * aqui contra el catalogo. "solicitante" queda fuera a proposito —no es
   * personal interno, no se da de alta desde esta pantalla.
   */
  private async validarRol(clave: string): Promise<void> {
    if (clave === 'solicitante') {
      throw new BadRequestException('Ese rol no se asigna desde aqui');
    }
    const rol = await this.roles.findOne({ where: { clave, activo: true } });
    if (!rol) throw new BadRequestException('Ese rol no existe o esta inactivo');
  }

  /** Empareja por nombre exacto contra el catalogo local; null si no hay match. */
  private async resolverDependenciaSaf(idSaf: number | null): Promise<number | null> {
    if (!idSaf) return null;
    const sDep = await this.sDependencias.findByPk(idSaf);
    if (!sDep) return null;
    const local = await this.dependencias.findOne({ where: { nombre: sDep.Nombre.trim() } });
    return local?.id ?? null;
  }

  /**
   * Activos de saf que coinciden con la busqueda y que todavia no tienen rol
   * asignado aqui (si ya estan en ticketsv2.usuario, no tiene caso ofrecerlos:
   * registrarlos de nuevo solo tronaria por rfc duplicado).
   */
  async buscarSaf(q: string) {
    const texto = q.trim();
    if (texto.length < 3) return [];

    const candidatos = await this.sUsuarios.findAll({
      where: { Estado: 1, Nombre: { [Op.like]: `%${texto}%` } },
      order: [['Nombre', 'ASC']],
      limit: 20,
    });
    if (!candidatos.length) return [];

    const rfcs = candidatos.map((s) => s.N_Usuario);
    const registrados = await this.usuarios.findAll({
      where: { rfc: { [Op.in]: rfcs } },
      attributes: ['rfc'],
    });
    const yaRegistrado = new Set(registrados.map((u) => u.rfc));

    const resultado: {
      id_usuario_saf: number;
      nombre: string;
      rfc: string;
      dependencia_id: number | null;
      dependencia: string | null;
    }[] = [];
    for (const s of candidatos) {
      if (yaRegistrado.has(s.N_Usuario)) continue;
      const dependenciaId = await this.resolverDependenciaSaf(s.id_Dependencia);
      const dependencia = dependenciaId ? await this.dependencias.findByPk(dependenciaId) : null;
      resultado.push({
        id_usuario_saf: s.id_Usuario,
        nombre: s.Nombre,
        rfc: s.N_Usuario,
        dependencia_id: dependenciaId,
        dependencia: dependencia?.nombre ?? null,
      });
    }
    return resultado;
  }

  /** Personal ya dado de alta aqui: cualquier rol de staff, "solicitante" queda fuera. */
  async listar() {
    const filas = await this.usuarios.findAll({
      where: { rol: { [Op.ne]: 'solicitante' } },
      include: [
        Dependencia,
        Area,
        { model: TecnicoServicio, include: [Servicio] },
        { model: DependenciaValidador, include: [Dependencia] },
      ],
      order: [
        ['rol', 'ASC'],
        ['nombre', 'ASC'],
      ],
    });

    /*
     * Usuario.dependencia_id es solo la foto del alta (ver registrar()): si
     * la persona cambia de dependencia en saf despues, esa columna se queda
     * atrasada. Aqui se resuelve de nuevo via saf (rfc) para todos de un
     * jalon, y esa gana; la columna local solo es respaldo si no hay rfc o
     * no hay match en saf.
     */
    const rfcs = filas.map((u) => u.rfc).filter((r): r is string => !!r);
    const sUsuarios = rfcs.length
      ? await this.sUsuarios.findAll({ where: { N_Usuario: { [Op.in]: rfcs } } })
      : [];
    const idSafPorRfc = new Map(sUsuarios.map((s) => [s.N_Usuario, s.id_Dependencia]));
    const idsSaf = [...new Set(sUsuarios.map((s) => s.id_Dependencia).filter((id): id is number => !!id))];
    const sDependenciasPorId = idsSaf.length
      ? await this.sDependencias.findAll({ where: { id_Dependencia: { [Op.in]: idsSaf } } })
      : [];
    const nombrePorIdSaf = new Map(sDependenciasPorId.map((d) => [d.id_Dependencia, d.Nombre.trim()]));

    return filas.map((u) => {
      const idSaf = u.rfc ? idSafPorRfc.get(u.rfc) : null;
      const dependenciaSaf = idSaf ? nombrePorIdSaf.get(idSaf) : null;
      return {
        id: u.id,
        rfc: u.rfc,
        nombre: u.nombre,
        rol: u.rol,
        correo: u.correo,
        extension: u.extension,
        servicios: (u.especialidades ?? []).map((e) => e.servicio?.nombre).filter(Boolean),
        /** Para preseleccionar los checkboxes del formulario de edicion. */
        servicio_ids: (u.especialidades ?? []).map((e) => e.servicio_id),
        /** Solo rol validador: dependencias que revisa antes de turnar a tecnico. */
        dependencias_validador: (u.validaciones ?? [])
          .map((v) => v.dependencia?.nombre)
          .filter(Boolean),
        dependencia_ids_validador: (u.validaciones ?? []).map((v) => v.dependencia_id),
        dependencia: dependenciaSaf ?? u.dependencia?.nombre ?? null,
        area: u.area?.nombre ?? null,
        activo: u.activo,
      };
    });
  }

  /** Valida que todos los ids existan y que solo un tecnico pueda traer servicios. */
  private async validarServicios(servicioIds: number[] | undefined, rol: string): Promise<void> {
    if (!servicioIds?.length) return;
    if (rol !== 'tecnico') {
      throw new BadRequestException('Solo el rol tecnico puede traer tipo de servicio');
    }
    const encontrados = await this.servicios.count({ where: { id: { [Op.in]: servicioIds } } });
    if (encontrados !== new Set(servicioIds).size) {
      throw new BadRequestException('Alguno de los servicios elegidos no existe');
    }
  }

  /** Valida que todas las dependencias existan y que solo un validador pueda traerlas. */
  private async validarDependenciasValidador(
    dependenciaIds: number[] | undefined,
    rol: string,
  ): Promise<void> {
    if (!dependenciaIds?.length) return;
    if (rol !== 'validador') {
      throw new BadRequestException('Solo el rol validador puede traer dependencias a validar');
    }
    const encontradas = await this.dependencias.count({ where: { id: { [Op.in]: dependenciaIds } } });
    if (encontradas !== new Set(dependenciaIds).size) {
      throw new BadRequestException('Alguna de las dependencias elegidas no existe');
    }
  }

  async registrar(dto: RegistrarUsuarioDto) {
    const sUsuario = await this.sUsuarios.findByPk(dto.id_usuario_saf);
    if (!sUsuario || sUsuario.Estado !== 1) {
      throw new BadRequestException('Ese usuario de saf no existe o ya no esta activo');
    }

    const rfc = sUsuario.N_Usuario.trim().toUpperCase();
    if (await this.usuarios.count({ where: { rfc } })) {
      throw new ConflictException('Ese rfc ya tiene un rol asignado en el sistema');
    }

    await this.validarRol(dto.rol);
    await this.validarServicios(dto.servicio_ids, dto.rol);
    await this.validarDependenciasValidador(dto.dependencia_ids, dto.rol);

    const dependenciaId = await this.resolverDependenciaSaf(sUsuario.id_Dependencia);

    try {
      const creado = await this.usuarios.create({
        rfc,
        nombre: sUsuario.Nombre.trim(),
        correo: dto.correo?.trim().toLowerCase() || null,
        extension: dto.extension?.trim() || null,
        dependencia_id: dependenciaId,
        area_id: null,
        rol: dto.rol,
        activo: true,
      });

      if (dto.servicio_ids?.length) {
        await this.tecnicoServicio.bulkCreate(
          dto.servicio_ids.map((servicio_id) => ({ usuario_id: creado.id, servicio_id, suplente: false })),
        );
      }

      if (dto.dependencia_ids?.length) {
        await this.validadores.bulkCreate(
          dto.dependencia_ids.map((dependencia_id) => ({ usuario_id: creado.id, dependencia_id })),
        );
      }

      return { id: creado.id, rfc: creado.rfc, nombre: creado.nombre, rol: creado.rol };
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ese correo ya esta en uso por otra cuenta');
      }
      throw e;
    }
  }

  /**
   * rfc y nombre no se tocan: vienen de saf y no se editan aqui. Los
   * servicios se ajustan por diferencia (se quitan los que ya no vienen en
   * la lista, se agregan los nuevos) en vez de borrar todo y recrear, para
   * no tocar de mas la tabla tecnico_servicio. Esto es independiente de la
   * bitacora de tickets: quitar un servicio de un tecnico no afecta ni
   * borra nada del historial de los tickets que ya atendio con ese
   * servicio, solo deja de contar para la asignacion automatica de ahi en
   * adelante.
   */
  async actualizar(id: number, dto: ActualizarUsuarioDto) {
    const usuario = await this.usuarios.findByPk(id);
    if (!usuario) throw new NotFoundException('Ese usuario no existe');

    await this.validarRol(dto.rol);
    await this.validarServicios(dto.servicio_ids, dto.rol);
    await this.validarDependenciasValidador(dto.dependencia_ids, dto.rol);

    try {
      await usuario.update({
        rol: dto.rol,
        correo: dto.correo?.trim().toLowerCase() || null,
        extension: dto.extension?.trim() || null,
        ...(dto.activo !== undefined && { activo: dto.activo }),
      });

      if (dto.rol !== 'tecnico') {
        await this.tecnicoServicio.destroy({ where: { usuario_id: id } });
      } else {
        const nuevos = dto.servicio_ids ?? [];
        const actuales = await this.tecnicoServicio.findAll({ where: { usuario_id: id } });
        const aQuitar = actuales.filter((e) => !nuevos.includes(e.servicio_id));
        const aAgregar = nuevos.filter((sid) => !actuales.some((e) => e.servicio_id === sid));

        if (aQuitar.length) {
          await this.tecnicoServicio.destroy({
            where: { usuario_id: id, servicio_id: { [Op.in]: aQuitar.map((e) => e.servicio_id) } },
          });
        }
        if (aAgregar.length) {
          await this.tecnicoServicio.bulkCreate(
            aAgregar.map((servicio_id) => ({ usuario_id: id, servicio_id, suplente: false })),
          );
        }
      }

      if (dto.rol !== 'validador') {
        await this.validadores.destroy({ where: { usuario_id: id } });
      } else {
        const nuevas = dto.dependencia_ids ?? [];
        const actuales = await this.validadores.findAll({ where: { usuario_id: id } });
        const aQuitar = actuales.filter((e) => !nuevas.includes(e.dependencia_id));
        const aAgregar = nuevas.filter((did) => !actuales.some((e) => e.dependencia_id === did));

        if (aQuitar.length) {
          await this.validadores.destroy({
            where: { usuario_id: id, dependencia_id: { [Op.in]: aQuitar.map((e) => e.dependencia_id) } },
          });
        }
        if (aAgregar.length) {
          await this.validadores.bulkCreate(
            aAgregar.map((dependencia_id) => ({ usuario_id: id, dependencia_id })),
          );
        }
      }
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ese correo ya esta en uso por otra cuenta');
      }
      throw e;
    }

    return { id };
  }
}
