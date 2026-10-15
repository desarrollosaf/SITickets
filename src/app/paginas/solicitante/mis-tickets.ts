import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { TicketsService } from '../../core/tickets.service';
import { AuthService } from '../../core/auth.service';
import { fecha, mensajeError } from '../../core/formato';
import type { Catalogos, Ticket, TicketPorValidar } from '../../core/modelos';

@Component({
  selector: 'app-mis-tickets',
  imports: [RouterLink, TablaTickets, DetalleTicket],
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

    @if (porConfirmar().length) {
      <div class="alert alert-primary py-2 small">
        Tienes <b>{{ porConfirmar().length }}</b> ticket(s) marcados como resueltos esperando tu
        confirmación. Si no respondes en 3 días, el sistema los cierra por omisión.
      </div>
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

    <app-tabla-tickets
      [tickets]="ticketsPagina()"
      [pedirConfirmacion]="true"
      vacio="Aún no has registrado tickets"
      ayudaVacio="Cuando reportes algo aparecerá aquí con su seguimiento."
      (abrir)="abierto.set($event)" />

    @if (totalPaginas() > 1) {
      <div class="d-flex align-items-center justify-content-between mt-2">
        <span class="sub small">Página {{ paginaActual() }} de {{ totalPaginas() }}</span>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" [disabled]="paginaActual() === 1"
                  (click)="paginaAnterior()">
            <i class="bi bi-chevron-left"></i> Anterior
          </button>
          <button class="btn btn-outline-secondary btn-sm" [disabled]="paginaActual() === totalPaginas()"
                  (click)="paginaSiguiente()">
            Siguiente <i class="bi bi-chevron-right"></i>
          </button>
        </div>
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

  readonly porConfirmar = () => this.tickets().filter((t) => t.estatus === 'RESUELTO');

  /** §16 solo el gestor tiene este endpoint; para el resto queda vacio. */
  readonly enValidacion = signal<TicketPorValidar[]>([]);

  readonly porPagina = 10;
  readonly paginaActual = signal(1);

  totalPaginas() {
    return Math.max(1, Math.ceil(this.tickets().length / this.porPagina));
  }

  ticketsPagina() {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.tickets().slice(inicio, inicio + this.porPagina);
  }

  paginaAnterior() {
    this.paginaActual.update((p) => Math.max(1, p - 1));
  }

  paginaSiguiente() {
    this.paginaActual.update((p) => Math.min(this.totalPaginas(), p + 1));
  }

  constructor() {
    this.api.catalogos().subscribe({ next: (c) => this.catalogos.set(c) });
    if (this.auth.rol() === 'gestor') {
      this.api.misPorValidar().subscribe({ next: (r) => this.enValidacion.set(r) });
    }
    this.cargar();
  }

  cargar() {
    this.api.listar({ propios: 'true' }).subscribe({
      next: (t) => {
        this.tickets.set(t);
        this.paginaActual.set(1);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
