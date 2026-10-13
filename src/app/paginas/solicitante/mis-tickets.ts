import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError } from '../../core/formato';
import type { Catalogos, Ticket } from '../../core/modelos';

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

    @if (porValidar().length) {
      <div class="alert alert-primary py-2 small">
        Tienes <b>{{ porValidar().length }}</b> ticket(s) marcados como resueltos esperando tu
        confirmación. Si no respondes en 3 días, el sistema los cierra por omisión.
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

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly abierto = signal<number | null>(null);
  readonly error = signal('');

  readonly porValidar = () => this.tickets().filter((t) => t.estatus === 'RESUELTO');

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
