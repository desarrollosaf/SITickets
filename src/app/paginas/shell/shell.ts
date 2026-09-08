import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/formato';
import type { Rol } from '../../core/modelos';

interface Opcion {
  /** Ausente cuando la opcion abre un manual en vez de navegar (ver `manual`). */
  ruta?: string;
  /** Abre el pdf correspondiente en una pestaña nueva en vez de navegar. */
  manual?: 'solicitante' | 'tecnico';
  etiqueta: string;
  icono: string;
}

/** Menu por rol. Cada perfil ve solo las pantallas de su trabajo. */
const MENUS: Record<Rol, Opcion[]> = {
  admin: [
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/tickets', etiqueta: 'Todos los tickets', icono: 'bi-inboxes' },
    { ruta: '/monitor', etiqueta: 'Monitor de turnos', icono: 'bi-display' },
    { ruta: '/tablero', etiqueta: 'Tablero', icono: 'bi-graph-up' },
    { ruta: '/disponibilidad', etiqueta: 'Disponibilidad', icono: 'bi-calendar3' },
    { ruta: '/internos', etiqueta: 'Tickets internos', icono: 'bi-tools' },
    { ruta: '/catalogo-servicios', etiqueta: 'Catálogo de servicios', icono: 'bi-diagram-3' },
    { ruta: '/catalogo-problemas', etiqueta: 'Catálogo de problemas', icono: 'bi-list-check' },
    { ruta: '/prioridades', etiqueta: 'Prioridades', icono: 'bi-speedometer2' },
    { ruta: '/usuarios', etiqueta: 'Registrar usuario', icono: 'bi-person-plus' },
  ],
  tecnico: [
    { ruta: '/bandeja', etiqueta: 'Mis tickets turnados', icono: 'bi-clipboard-check' },
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
    { manual: 'tecnico', etiqueta: 'Manual de usuario', icono: 'bi-question-circle' },
  ],
  proveedor: [
    { ruta: '/bandeja', etiqueta: 'Tickets turnados', icono: 'bi-clipboard-check' },
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
  ],
  jefe: [
    { ruta: '/bandeja', etiqueta: 'Mis tickets turnados', icono: 'bi-clipboard-check' },
    { ruta: '/internos', etiqueta: 'Tickets internos', icono: 'bi-tools' },
    { ruta: '/monitor', etiqueta: 'Monitor de turnos', icono: 'bi-display' },
    { ruta: '/tablero', etiqueta: 'Tablero', icono: 'bi-graph-up' },
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
  ],
  solicitante: [
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
    { manual: 'solicitante', etiqueta: 'Guía del solicitante', icono: 'bi-question-circle' },
  ],
  operador: [
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/tickets', etiqueta: 'Todos los tickets', icono: 'bi-inboxes' },
    { ruta: '/monitor', etiqueta: 'Monitor de turnos', icono: 'bi-display' },
    { ruta: '/tablero', etiqueta: 'Tablero', icono: 'bi-graph-up' },
  ],
  gestor: [
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
  ],
};

const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  jefe: 'Jefe de departamento',
  proveedor: 'Proveedor externo',
  solicitante: 'Solicitante',
  operador: 'Operador',
  gestor: 'Gestor',
};

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly usuario = this.auth.usuario;
  readonly menu = computed(() => (this.auth.rol() ? MENUS[this.auth.rol()!] : []));
  readonly nombreRol = computed(() => (this.auth.rol() ? NOMBRE_ROL[this.auth.rol()!] : ''));
  readonly railAbierto = signal(false);

  /** Abre el manual en pdf en una pestaña nueva. */
  abrirManual(tipo: 'solicitante' | 'tecnico') {
    this.http.get(`${API}/manuales/${tipo}`, { responseType: 'blob' }).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  /* --- cambio de contrasena --- */
  readonly modalPassword = signal(false);
  actual = '';
  nueva = '';
  readonly avisoPassword = signal('');
  readonly errorPassword = signal('');

  abrirPassword() {
    this.actual = '';
    this.nueva = '';
    this.avisoPassword.set('');
    this.errorPassword.set('');
    this.modalPassword.set(true);
  }

  guardarPassword() {
    this.errorPassword.set('');
    this.auth.cambiarPassword(this.actual, this.nueva).subscribe({
      next: () => {
        this.avisoPassword.set('Contraseña actualizada.');
        this.actual = '';
        this.nueva = '';
      },
      error: (e) => this.errorPassword.set(mensajeError(e)),
    });
  }
}
