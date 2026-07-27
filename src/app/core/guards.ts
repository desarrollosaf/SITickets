import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { Rol } from './modelos';

/** Exige sesion. Sin ella, al acceso. */
export const guardSesion: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.autenticado() ? true : router.createUrlTree(['/entrar']);
};

/** Ya autenticado: el acceso y el alta de cuenta dejan de tener sentido. */
export const guardAnonimo: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const rol = auth.rol();
  return rol ? router.createUrlTree([auth.inicioDeRol(rol)]) : true;
};

/**
 * Restringe por rol. Es comodidad de navegacion, no seguridad: quien manipule
 * el navegador puede saltarselo. La barrera real esta en los guards de NestJS,
 * que revisan el rol contra la base en cada peticion.
 */
export const guardRol = (...permitidos: Rol[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const rol = auth.rol();
    if (!rol) return router.createUrlTree(['/entrar']);
    return permitidos.includes(rol) ? true : router.createUrlTree([auth.inicioDeRol(rol)]);
  };
};
