import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import { Area, Dependencia, SDependencia, Servicio, SUsuario, TecnicoServicio, Usuario } from '../database/models';
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
  ) {}

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

  /** Personal ya dado de alta aqui (tecnico/jefe/admin/proveedor), para referencia en pantalla. */
  async listar() {
    const filas = await this.usuarios.findAll({
      where: { rol: { [Op.in]: ['tecnico', 'jefe', 'admin', 'proveedor', 'operador', 'gestor'] } },
      include: [Dependencia, Area, { model: TecnicoServicio, include: [Servicio] }],
      order: [
        ['rol', 'ASC'],
        ['nombre', 'ASC'],
      ],
    });
    return filas.map((u) => ({
      id: u.id,
      rfc: u.rfc,
      nombre: u.nombre,
      rol: u.rol,
      correo: u.correo,
      extension: u.extension,
      servicios: (u.especialidades ?? []).map((e) => e.servicio?.nombre).filter(Boolean),
      /** Para preseleccionar los checkboxes del formulario de edicion. */
      servicio_ids: (u.especialidades ?? []).map((e) => e.servicio_id),
      dependencia: u.dependencia?.nombre ?? null,
      area: u.area?.nombre ?? null,
      activo: u.activo,
    }));
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

  async registrar(dto: RegistrarUsuarioDto) {
    const sUsuario = await this.sUsuarios.findByPk(dto.id_usuario_saf);
    if (!sUsuario || sUsuario.Estado !== 1) {
      throw new BadRequestException('Ese usuario de saf no existe o ya no esta activo');
    }

    const rfc = sUsuario.N_Usuario.trim().toUpperCase();
    if (await this.usuarios.count({ where: { rfc } })) {
      throw new ConflictException('Ese rfc ya tiene un rol asignado en el sistema');
    }

    await this.validarServicios(dto.servicio_ids, dto.rol);

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

    await this.validarServicios(dto.servicio_ids, dto.rol);

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
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Ese correo ya esta en uso por otra cuenta');
      }
      throw e;
    }

    return { id };
  }
}
