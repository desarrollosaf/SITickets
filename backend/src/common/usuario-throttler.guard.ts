import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { UsuarioToken } from './usuario-actual.decorator';

/**
 * Limita por usuario en lugar de por IP. Detras de Docker o de un proxy todos
 * los empleados llegan con la misma IP y compartian un solo cupo, asi que unas
 * cuantas pantallas de monitor bastaban para dejar a toda la oficina en 429.
 *
 * Corre despues de JwtAuthGuard: en rutas con sesion req.user ya existe. Los
 * ids de saf.s_usuario y de ticketsv2.usuario pueden coincidir, por eso el
 * origen va en la llave.
 *
 * El login cuenta por RFC: asi cada cuenta tiene sus propios intentos y 50
 * personas entrando a la vez no se estorban, aunque todas compartan la IP
 * del Apache. Lo que se busca frenar es que adivinen la contrasena de una
 * cuenta, y eso se mide por cuenta.
 */
@Injectable()
export class UsuarioThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: {
    user?: UsuarioToken;
    body?: { rfc?: unknown };
    ip?: string;
  }): Promise<string> {
    const usuario = req.user;
    if (usuario) return `usuario:${usuario.externo ? 'saf' : 'local'}:${usuario.id}`;
    const rfc = req.body?.rfc;
    if (typeof rfc === 'string' && rfc.trim()) return `rfc:${rfc.trim().toUpperCase()}`;
    return `ip:${req.ip ?? 'desconocida'}`;
  }
}
