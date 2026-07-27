import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Usuario } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

export interface JwtPayload {
  sub: number;
  rol: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'secreto_de_desarrollo',
    });
  }

  /**
   * El rol se releé de la base en cada peticion. Si el administrador cambia el
   * rol o desactiva la cuenta, el token vigente deja de servir de inmediato.
   */
  async validate(payload: JwtPayload): Promise<UsuarioToken> {
    const u = await this.usuarios.findByPk(payload.sub, {
      attributes: ['id', 'nombre', 'rol', 'correo', 'activo'],
    });
    if (!u || !u.activo) throw new UnauthorizedException('Sesion invalida');
    return { id: u.id, nombre: u.nombre, rol: u.rol, correo: u.correo };
  }
}
