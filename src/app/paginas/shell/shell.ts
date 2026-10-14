import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError } from '../../core/formato';
import type { Rol } from '../../core/modelos';

interface Opcion {
  /** Ausente cuando la opcion abre un manual en vez de navegar (ver `manual`). */
  ruta?: string;
  /** Abre el pdf correspondiente en una pestaña nueva en vez de navegar. */
  manual?: 'solicitante' | 'tecnico' | 'administrador';
  etiqueta: string;
  icono: string;
  grupo?: 'Tickets' | 'Operación' | 'Catálogos' |
          'Administración' | 'Reportes' | 'Ayuda';
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
    { ruta: '/catalogo-servicios', etiqueta: 'Catálogo de servicios',
    icono: 'bi-diagram-3', grupo: 'Catálogos' },
    { ruta: '/catalogo-problemas', etiqueta: 'Catálogo de problemas',
    icono: 'bi-list-check', grupo: 'Catálogos' },
    { ruta: '/prioridades', etiqueta: 'Prioridades',
    icono: 'bi-speedometer2', grupo: 'Catálogos' },
    { ruta: '/catalogo-roles', etiqueta: 'Catálogo de roles',
    icono: 'bi-person-badge', grupo: 'Catálogos' },
    { ruta: '/usuarios', etiqueta: 'Registrar usuario', icono: 'bi-person-plus' },
    { ruta: '/reportes', etiqueta: 'Reporte de tickets', icono: 'bi-file-earmark-excel' },
    { ruta: '/bajas', etiqueta: 'Equipos dados de baja', icono: 'bi-pc-display-horizontal' },
    { manual: 'administrador', etiqueta: 'Manual del administrador', icono: 'bi-question-circle' },
  ],
  tecnico: [
    { ruta: '/bandeja', etiqueta: 'Mis tickets turnados', icono: 'bi-clipboard-check' },
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
    { manual: 'tecnico', etiqueta: 'Manual del técnico', icono: 'bi-question-circle' },
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
    { ruta: '/tickets', etiqueta: 'Tickets generados', icono: 'bi-inboxes' },
  ],
  validador: [
    { ruta: '/nuevo', etiqueta: 'Registrar ticket', icono: 'bi-plus-circle' },
    { ruta: '/mis-tickets', etiqueta: 'Mis tickets', icono: 'bi-card-list' },
    { ruta: '/tickets-por-validar', etiqueta: 'Tickets por validar', icono: 'bi-patch-check' },
    { ruta: '/tickets', etiqueta: 'Tickets generados', icono: 'bi-inboxes' },
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
  validador: 'Validador',
};

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly api = inject(TicketsService);
  private readonly router = inject(Router);

  readonly usuario = this.auth.usuario;
  /* Un rol del catalogo sin menu programado (ver CatalogoRol) no truena: */
  readonly menu = computed(() => (this.auth.rol() ? (MENUS[this.auth.rol()!] ?? []) : []));
  readonly nombreRol = computed(() => (this.auth.rol() ? NOMBRE_ROL[this.auth.rol()!] : ''));
  readonly railAbierto = signal(false);
  readonly catalogosAbierto = signal(false);

  /** Iniciales para el avatar del menu movil: primeras dos palabras del nombre. */
  readonly iniciales = computed(() => {
    const partes = (this.usuario()?.nombre ?? '').trim().split(/\s+/).filter(Boolean);
    return partes.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  });

  /** Cuantos tickets tiene el validador esperando en "Tickets por validar". */
  readonly pendientesValidar = signal(0);

  constructor() {
    if (this.auth.rol() === 'validador') {
      this.cargarPendientesValidar();
      /* Se refresca al navegar (p.ej. tras aprobar/rechazar y volver) y cada
         minuto, por si le llega un ticket nuevo de otro gestor sin que el
         navegue el mismo a ningun lado. */
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
        this.cargarPendientesValidar();
      });
      setInterval(() => this.cargarPendientesValidar(), 60_000);
    }
  }

  private cargarPendientesValidar() {
    this.api.porValidar().subscribe({
      next: (t) => this.pendientesValidar.set(t.length),
      error: () => {
        /* Si falla, simplemente no se muestra el indicador: no es critico. */
      },
    });
  }

  /** Abre el manual en pdf en una pestaña nueva. */
  abrirManual(tipo: 'solicitante' | 'tecnico' | 'administrador') {
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
