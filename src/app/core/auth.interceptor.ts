import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Adjunta el token y cierra la sesion cuando el backend la rechaza. Un 401 en
 * cualquier peticion significa que el token vencio o que la cuenta se
 * desactivo: en ambos casos lo correcto es devolver al usuario al acceso.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.obtenerToken();

  const peticion = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(peticion).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401 && !req.url.includes('/auth/login')) auth.salir();
      return throwError(() => e);
    }),
  );
};
