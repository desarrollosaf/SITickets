import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Rol } from '../database/models';

/** Identidad que el guard deja en la peticion tras validar el token. */
export interface UsuarioToken {
  id: number;
  nombre: string;
  rol: Rol;
  correo: string | null;
}

/**
 * Inyecta al usuario de la sesion. Ninguna ruta debe tomar el id del cuerpo de
 * la peticion: ese fue el hueco de seguridad de la API PHP original, donde
 * cualquiera podia cerrar tickets ajenos mandando otro identificador.
 */
export const UsuarioActual = createParamDecorator(
  (dato: keyof UsuarioToken | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: UsuarioToken }>();
    const usuario = req.user;
    if (!usuario) return null;
    return dato ? usuario[dato] : usuario;
  },
);
