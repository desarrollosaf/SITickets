import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TablaTickets } from '../../comp/tabla-tickets';
import { Pildoras } from '../../comp/pildoras';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { TicketsService } from '../../core/tickets.service';
import { AuthService } from '../../core/auth.service';
import {
  etiquetaEstatus,
  fecha,
  mensajeError,
  paginasConSalto,
  pestanaDe,
  type PestanaTicket,
} from '../../core/formato';
import type { Catalogos, Ticket, TicketPorValidar } from '../../core/modelos';

type Pestana = PestanaTicket;

/** Minusculas y sin acentos: "tecnico" encuentra "TÉCNICO". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Component({
  selector: 'app-mis-tickets',
  imports: [RouterLink, TablaTickets, DetalleTicket, Pildoras],
  template: `
    <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
      <div>
        <h1 class="h5 mb-1">Mis tickets</h1>
        <p class="sub mb-0">Aquí confirmas o rechazas lo que el técnico marcó como resuelto.</p>
      </div>
      <a routerLink="/nuevo" class="btn btn-sm btn-primary">
        <i class="bi bi-plus-lg"></i> Registrar ticket
      </a>
    </div>

    @if (error()) {
      <div class="alert alert-danger py-2 small">{{ error() }}</div>
    }

    @if (enValidacion().length) {
      <div class="tarjeta p-3 mb-3">
        <h2 class="h6 mb-2">En validación</h2>
        <p class="sub small mb-3">
          Lo que registraste y todavía no pasa por tu validador (o fue rechazado). Mientras no se
          apruebe, no se turna a técnico ni cuenta el tiempo de atención.
        </p>
        <div class="d-flex flex-column gap-2">
          @for (t of enValidacion(); track t.id) {
            <div class="d-flex justify-content-between align-items-start gap-2 border-bottom pb-2">
              <div>
                <div class="folio" style="font-size: 0.75rem">{{ t.folio }}</div>
                <div class="fw-semibold" style="font-size: 0.9rem">{{ t.problema }}</div>
                <div class="sub" style="font-size: 0.8rem">
                  {{ t.servicio }}@if (t.contexto) { · {{ t.contexto }} }
                </div>
                @if (t.edificio_atencion) {
                  <div class="sub" style="font-size: 0.75rem">
                    <i class="bi bi-geo-alt"></i> {{ t.edificio_atencion }}
                  </div>
                }
                <div class="sub" style="font-size: 0.75rem">Capturado {{ fmt(t.f_captura) }}</div>
              </div>
              @if (t.motivo_rechazo_validacion) {
                <span class="chip chip-bandera">Rechazado: {{ t.motivo_rechazo_validacion }}</span>
              } @else {
                <span class="badge text-bg-warning-subtle text-warning-emphasis">Pendiente</span>
              }
            </div>
          }
        </div>
      </div>
    }

    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
      <app-pildoras [opciones]="pestanas" [activa]="pestana()" [conteo]="conteo()"
                    (cambio)="cambiarPestana($any($event))" />

      <div class="buscador">
        <i class="bi bi-search"></i>
        <input type="search" class="form-control form-control-sm"
               placeholder="Buscar por folio, técnico, descripción, edificio…"
               [value]="busqueda()" (input)="buscar($any($event.target).value)" />
      </div>
    </div>

    @if (pestana() === 'confirmar' && filtrados().length) {
      <div class="alert alert-warning py-2 small d-flex gap-2 align-items-center">
        <i class="bi bi-hourglass-split"></i>
        <span>
          El técnico los marcó como resueltos. Ábrelos para confirmar o rechazar: si no respondes
          en 3 días, el sistema los cierra solo.
        </span>
      </div>
    }

    <app-tabla-tickets
      [tickets]="ticketsPagina()"
      [pedirConfirmacion]="true"
      [boletos]="true"
      [vacio]="vacio()"
      [ayudaVacio]="busqueda() ? 'Prueba con otra palabra o revisa las otras pestañas.' : ''"
      (abrir)="abierto.set($event)" />

    @if (filtrados().length) {
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
        <span class="sub small">
          {{ desde() }}–{{ hasta() }} de {{ filtrados().length }} ticket(s)
        </span>
        @if (totalPaginas() > 1) {
          <nav class="paginador" aria-label="Páginas">
            <button type="button" [disabled]="paginaActual() === 1" (click)="irA(paginaActual() - 1)"
                    aria-label="Anterior">
              <i class="bi bi-chevron-left"></i>
            </button>
            @for (n of paginas(); track $index) {
              @if (n === null) {
                <span class="sub px-1">…</span>
              } @else {
                <button type="button" [class.activa]="n === paginaActual()" (click)="irA(n)">{{ n }}</button>
              }
            }
            <button type="button" [disabled]="paginaActual() === totalPaginas()"
                    (click)="irA(paginaActual() + 1)" aria-label="Siguiente">
              <i class="bi bi-chevron-right"></i>
            </button>
          </nav>
        }
      </div>
    }

    <app-detalle-ticket
      [ticketId]="abierto()"
      [catalogos]="catalogos()"
      (cerrar)="abierto.set(null)"
      (cambio)="cargar()" />
  `,
})
export class MisTickets {
  private readonly api = inject(TicketsService);
  private readonly auth = inject(AuthService);

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly abierto = signal<number | null>(null);
  readonly error = signal('');
  readonly fmt = fecha;

  /** §16 solo el gestor tiene este endpoint; para el resto queda vacio. */
  readonly enValidacion = signal<TicketPorValidar[]>([]);

  readonly pestanas = [
    { clave: 'abiertos', texto: 'Abiertos', icono: 'bi-ticket-perforated', tono: '#2b6cb0' },
    { clave: 'confirmar', texto: 'Por confirmar', icono: 'bi-hourglass-split', tono: '#c9971c' },
    { clave: 'cerrados', texto: 'Cerrados', icono: 'bi-check2-circle', tono: '#1f8a56' },
  ] as const;
  readonly pestana = signal<Pestana>('abiertos');
  readonly busqueda = signal('');

  /**
   * La busqueda se aplica antes de repartir en pestañas: asi el contador de
   * cada pestaña dice donde hay coincidencias aunque no sea la que esta abierta.
   */
  readonly coincidencias = computed(() => {
    const q = normalizar(this.busqueda().trim());
    if (!q) return this.tickets();
    const palabras = q.split(/\s+/);
    return this.tickets().filter((t) => {
      const texto = normalizar(
        [
          t.folio,
          t.folio_general,
          t.problema,
          t.servicio,
          t.tecnico,
          t.contexto,
          t.edificio_atencion,
          t.campo_adicional,
          t.modelo_traslado,
          t.registrado_por_nombre,
          etiquetaEstatus(t, true).texto,
        ]
          .filter(Boolean)
          .join(' '),
      );
      return palabras.every((p) => texto.includes(p));
    });
  });

  readonly conteo = computed(() => {
    const c: Record<Pestana, number> = { abiertos: 0, confirmar: 0, cerrados: 0 };
    for (const t of this.coincidencias()) c[pestanaDe(t.estatus)]++;
    return c;
  });

  readonly filtrados = computed(() =>
    this.coincidencias().filter((t) => pestanaDe(t.estatus) === this.pestana()),
  );

  readonly vacio = computed(() => {
    if (this.busqueda().trim()) return 'Ningún ticket coincide con la búsqueda';
    return {
      abiertos: 'No tienes tickets abiertos',
      confirmar: 'No tienes tickets por confirmar',
      cerrados: 'Aún no tienes tickets cerrados',
    }[this.pestana()];
  });

  readonly porPagina = 10;
  readonly paginaActual = signal(1);

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.filtrados().length / this.porPagina)),
  );
  readonly desde = computed(() => (this.paginaActual() - 1) * this.porPagina + 1);
  readonly hasta = computed(() =>
    Math.min(this.paginaActual() * this.porPagina, this.filtrados().length),
  );

  readonly ticketsPagina = computed(() =>
    this.filtrados().slice(this.desde() - 1, this.hasta()),
  );

  readonly paginas = computed(() => paginasConSalto(this.totalPaginas(), this.paginaActual()));

  constructor() {
    this.api.catalogos().subscribe({ next: (c) => this.catalogos.set(c) });
    if (this.auth.rol() === 'gestor') {
      this.api.misPorValidar().subscribe({ next: (r) => this.enValidacion.set(r) });
    }
    this.cargar(true);
  }

  cambiarPestana(p: Pestana) {
    this.pestana.set(p);
    this.paginaActual.set(1);
  }

  buscar(texto: string) {
    this.busqueda.set(texto);
    this.paginaActual.set(1);
  }

  irA(n: number) {
    this.paginaActual.set(Math.min(Math.max(1, n), this.totalPaginas()));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * La primera vez abre "Por confirmar" si hay algo esperando respuesta: es lo
   * unico que le pide accion al solicitante. Al recargar tras un cambio se
   * queda en la pestaña donde estaba.
   */
  cargar(inicial = false) {
    this.api.listar({ propios: 'true' }).subscribe({
      next: (t) => {
        this.tickets.set(t);
        if (inicial && t.some((x) => x.estatus === 'RESUELTO')) this.pestana.set('confirmar');
        this.paginaActual.set(Math.min(this.paginaActual(), this.totalPaginas()));
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
