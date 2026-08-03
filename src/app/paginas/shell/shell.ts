import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/formato';
import type { Rol } from '../../core/modelos';

interface Opcion {
  ruta: string;
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
    { ruta: '/catalogo', etiqueta: 'Catálogo', icono: 'bi-list-check' },
    { ruta: '/prioridades', etiqueta: 'Prioridades', icono: 'bi-speedometer2' },
    { ruta: '/usuarios', etiqueta: 'Registrar usuario', icono: 'bi-person-plus' },
  ],
  tecnico: [{ ruta: '/bandeja', etiqueta: 'Mis tickets turnados', icono: 'bi-clipboard-check' }],
  proveedor: [{ ruta: '/bandeja', etiqueta: 'Tickets turnados', icono: 'bi-clipboard-check' }],
  jefe: [
    { ruta: '/bandeja', etiqueta: 'Mis tickets turnados', icono: 'bi-clipboard-check' },
    { ruta: '/internos', etiqueta: 'Tickets internos', icono: 'bi-tools' },
    { ruta: '/monitor', etiqueta: 'Monitor de turnos', icono: 'bi-display' },
    { ruta: '/tablero', etiqueta: 'Tablero', icono: 'bi-graph-up' },
  ],
  solicitante: [
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
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

  readonly usuario = this.auth.usuario;
  readonly menu = computed(() => (this.auth.rol() ? MENUS[this.auth.rol()!] : []));
  readonly nombreRol = computed(() => (this.auth.rol() ? NOMBRE_ROL[this.auth.rol()!] : ''));
  readonly railAbierto = signal(false);

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
