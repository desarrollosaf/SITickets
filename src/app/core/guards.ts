import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { Rol } from './modelos';

/** Exige sesion. Sin ella, al acceso — y recuerda a dónde iba (p. ej. /checador/:id del QR). */
export const guardSesion: CanActivateFn = (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado()) return true;
  return router.createUrlTree(['/entrar'], { queryParams: { volver: estado.url } });
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
  return (_ruta, estado) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const rol = auth.rol();
    if (!rol) return router.createUrlTree(['/entrar'], { queryParams: { volver: estado.url } });
    return permitidos.includes(rol) ? true : router.createUrlTree([auth.inicioDeRol(rol)]);
  };
};
