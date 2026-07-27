import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../database/models';

export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta a los roles indicados. Sin el decorador, la ruta queda
 * abierta a cualquier usuario autenticado; para abrirla a anonimos usa @Publico.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLICO_KEY = 'publico';

/** Marca una ruta como accesible sin token. */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);
