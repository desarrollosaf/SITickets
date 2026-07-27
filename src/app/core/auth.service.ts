import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API } from './api';
import type { Organizacion, Rol, Sesion, UsuarioSesion } from './modelos';

const LLAVE = 'sitickets.sesion';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** Sesion vigente. La pantalla entera se redibuja a partir de esta senal. */
  readonly usuario = signal<UsuarioSesion | null>(null);
  readonly rol = computed<Rol | null>(() => this.usuario()?.rol ?? null);
  readonly autenticado = computed(() => this.usuario() !== null);

  private token: string | null = null;

  constructor() {
    this.recuperar();
  }

  /*
   * El token vive en localStorage. Es el punto que habria que endurecer si el
   * sistema sale a internet abierto: una cookie httpOnly con refresh evita que
   * un XSS pueda leerlo. Dentro de la red interna, y con la sesion de 8 horas,
   * el riesgo es acotado.
   */
  private recuperar() {
    const crudo = localStorage.getItem(LLAVE);
    if (!crudo) return;
    try {
      const s = JSON.parse(crudo) as Sesion;
      this.token = s.token;
      this.usuario.set(s.usuario);
    } catch {
      localStorage.removeItem(LLAVE);
    }
  }

  obtenerToken(): string | null {
    return this.token;
  }

  login(correo: string, password: string) {
    return this.http
      .post<Sesion>(`${API}/auth/login`, { correo, password })
      .pipe(tap((s) => this.guardar(s)));
  }

  registrar(datos: {
    nombre: string;
    correo: string;
    password: string;
    dependencia_id: number;
    area_id: number;
    extension?: string;
  }) {
    return this.http.post<Sesion>(`${API}/auth/registro`, datos).pipe(tap((s) => this.guardar(s)));
  }

  cambiarPassword(actual: string, nueva: string) {
    return this.http.post<{ ok: true }>(`${API}/auth/password`, { actual, nueva });
  }

  /** Catalogo publico que necesita el formulario de alta de cuenta. */
  organizacion() {
    return this.http.get<Organizacion>(`${API}/catalogos/organizacion`);
  }

  salir() {
    this.token = null;
    this.usuario.set(null);
    localStorage.removeItem(LLAVE);
    void this.router.navigate(['/entrar']);
  }

  private guardar(s: Sesion) {
    this.token = s.token;
    this.usuario.set(s.usuario);
    localStorage.setItem(LLAVE, JSON.stringify(s));
  }

  /** Pantalla de inicio segun el rol: cada perfil entra donde trabaja. */
  inicioDeRol(rol: Rol): string {
    switch (rol) {
      case 'admin':
        return '/tickets';
      case 'tecnico':
      case 'proveedor':
        return '/bandeja';
      case 'jefe':
        return '/bandeja';
      default:
        return '/mis-tickets';
    }
  }
}
