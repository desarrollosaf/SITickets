import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { SUsuario, Usuario } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

export interface JwtPayload {
  sub: number;
  rol: string;
  /** true = sub es un saf.s_usuario.id_Usuario, no un usuario.id local. */
  externo: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(SUsuario, 'saf') private readonly usuariosSaf: typeof SUsuario,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'secreto_de_desarrollo',
    });
  }

  /**
   * Se revalida en cada peticion, no solo en el login. Si el administrador
   * cambia el rol o desactiva la cuenta (o si en saf lo dan de baja), el
   * token vigente deja de servir de inmediato.
   */
  async validate(payload: JwtPayload): Promise<UsuarioToken> {
    if (!payload.externo) {
      const u = await this.usuarios.findByPk(payload.sub, {
        attributes: ['id', 'nombre', 'rol', 'correo', 'activo'],
      });
      if (!u || !u.activo) throw new UnauthorizedException('Sesion invalida');
      return { id: u.id, nombre: u.nombre, rol: u.rol, correo: u.correo, externo: false };
    }

    const s = await this.usuariosSaf.findByPk(payload.sub);
    if (!s || s.Estado !== 1) throw new UnauthorizedException('Sesion invalida');
    return { id: s.id_Usuario, nombre: s.Nombre, rol: 'solicitante', correo: null, externo: true };
  }
}
