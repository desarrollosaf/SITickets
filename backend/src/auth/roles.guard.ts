import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/roles.decorator';
import type { Rol } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permitidos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permitidos?.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: UsuarioToken }>();
    const usuario = req.user;
    if (!usuario || !permitidos.includes(usuario.rol)) {
      throw new ForbiddenException('Tu perfil no tiene acceso a esta operacion');
    }
    return true;
  }
}
