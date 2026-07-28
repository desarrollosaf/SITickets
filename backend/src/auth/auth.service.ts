import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Area, Dependencia, SUsuario, Usuario, UserSaf } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';
import { CambiarPasswordDto, LoginDto } from './dto/auth.dto';

/** Coste de bcrypt. 12 es el punto razonable hoy entre seguridad y latencia. */
const ROUNDS = 12;

export interface SesionRespuesta {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    correo: string | null;
    rol: string;
    extension: string | null;
    dependencia: string | null;
    area: string | null;
    dependencia_id: number | null;
    area_id: number | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(UserSaf, 'saf') private readonly usuariosSaf: typeof UserSaf,
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
    private readonly jwt: JwtService,
  ) {}

  static hash(plano: string): Promise<string> {
    return bcrypt.hash(plano, ROUNDS);
  }

  async login(dto: LoginDto): Promise<SesionRespuesta> {
    const rfc = dto.rfc.trim().toUpperCase();

    const cuentaSaf = await this.usuariosSaf.findOne({ where: { rfc } });

    /*
     * Se compara siempre contra un hash, exista o no la cuenta en saf. Sin
     * esto, el tiempo de respuesta delataria que rfcs estan dados de alta.
     */
    const hash = cuentaSaf?.password ?? '$2a$12$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalidoinv';
    const coincide = await bcrypt.compare(dto.password, hash);

    if (!cuentaSaf || !coincide) {
      throw new UnauthorizedException('RFC o contrasena incorrectos');
    }

    /*
     * Existe en ticketsv2.usuario -> tiene rol asignado (tecnico, jefe,
     * admin, proveedor o un solicitante que ya se registro antes). Se usa
     * ese perfil tal cual, sin tocar nada.
     */
    const local = await this.usuarios.findOne({ where: { rfc }, include: [Dependencia, Area] });
    if (local) {
      if (!local.activo) throw new UnauthorizedException('RFC o contrasena incorrectos');
      return {
        token: this.jwt.sign({ sub: local.id, rol: local.rol, externo: false }),
        usuario: this.resumen(local),
      };
    }

    /*
     * No tiene rol asignado localmente: es un solicitante. No se crea fila
     * en usuario; su identidad es el padron de saf, revalidado en cada
     * peticion (ver JwtStrategy).
     */
    const sUsuario = await this.sUsuarios.findOne({ where: { N_Usuario: rfc } });
    if (!sUsuario || sUsuario.Estado !== 1) {
      throw new UnauthorizedException('RFC o contrasena incorrectos');
    }

    return {
      token: this.jwt.sign({ sub: sUsuario.id_Usuario, rol: 'solicitante', externo: true }),
      usuario: {
        id: sUsuario.id_Usuario,
        nombre: sUsuario.Nombre,
        correo: null,
        rol: 'solicitante',
        extension: null,
        dependencia: null,
        area: null,
        dependencia_id: null,
        area_id: null,
      },
    };
  }

  async cambiarPassword(usuario: UsuarioToken, dto: CambiarPasswordDto): Promise<{ ok: true }> {
    if (usuario.externo) {
      throw new ForbiddenException('Tu contrasena se administra en el sistema institucional');
    }

    const local = await this.usuarios.findByPk(usuario.id);
    if (!local?.password_hash) throw new UnauthorizedException('Sesion invalida');

    if (!(await bcrypt.compare(dto.actual, local.password_hash))) {
      throw new UnauthorizedException('La contrasena actual no coincide');
    }
    await local.update({ password_hash: await AuthService.hash(dto.nueva) });
    return { ok: true };
  }

  async perfil(usuario: UsuarioToken) {
    if (usuario.externo) {
      return {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: null,
        rol: usuario.rol,
        extension: null,
        dependencia: null,
        area: null,
        dependencia_id: null,
        area_id: null,
      };
    }

    const local = await this.usuarios.findByPk(usuario.id, {
      attributes: { exclude: ['password_hash'] },
      include: [Dependencia, Area],
    });
    if (!local) throw new UnauthorizedException('Sesion invalida');
    return this.resumen(local);
  }

  private resumen(usuario: Usuario) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      extension: usuario.extension,
      dependencia: usuario.dependencia?.nombre ?? null,
      area: usuario.area?.nombre ?? null,
      dependencia_id: usuario.dependencia_id,
      area_id: usuario.area_id,
    };
  }
}
