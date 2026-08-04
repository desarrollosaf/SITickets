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
      /** El select de edicion es unico: se usa la primera especialidad asignada, si hay. */
      servicio_id: u.especialidades?.[0]?.servicio_id ?? null,
      dependencia: u.dependencia?.nombre ?? null,
      area: u.area?.nombre ?? null,
      activo: u.activo,
    }));
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

    if (dto.servicio_id && dto.rol !== 'tecnico') {
      throw new BadRequestException('Solo el rol tecnico puede traer tipo de servicio');
    }
    if (dto.servicio_id) {
      const servicio = await this.servicios.findByPk(dto.servicio_id);
      if (!servicio) throw new BadRequestException('El servicio elegido no existe');
    }

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

      if (dto.servicio_id) {
        await this.tecnicoServicio.create({
          usuario_id: creado.id,
          servicio_id: dto.servicio_id,
          suplente: false,
        });
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
   * rfc y nombre no se tocan: vienen de saf y no se editan aqui. El
   * servicio se reemplaza por completo en cada edicion (se borra lo que
   * tenia y se vuelve a crear si mandan uno), para no acumular filas viejas
   * del select anterior.
   */
  async actualizar(id: number, dto: ActualizarUsuarioDto) {
    const usuario = await this.usuarios.findByPk(id);
    if (!usuario) throw new NotFoundException('Ese usuario no existe');

    if (dto.servicio_id && dto.rol !== 'tecnico') {
      throw new BadRequestException('Solo el rol tecnico puede traer tipo de servicio');
    }
    if (dto.servicio_id) {
      const servicio = await this.servicios.findByPk(dto.servicio_id);
      if (!servicio) throw new BadRequestException('El servicio elegido no existe');
    }

    try {
      await usuario.update({
        rol: dto.rol,
        correo: dto.correo?.trim().toLowerCase() || null,
        extension: dto.extension?.trim() || null,
        ...(dto.activo !== undefined && { activo: dto.activo }),
      });

      await this.tecnicoServicio.destroy({ where: { usuario_id: id } });
      if (dto.rol === 'tecnico' && dto.servicio_id) {
        await this.tecnicoServicio.create({
          usuario_id: id,
          servicio_id: dto.servicio_id,
          suplente: false,
        });
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
