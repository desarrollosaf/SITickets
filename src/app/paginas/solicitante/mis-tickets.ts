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
      [tickets]="tickets()"
      vacio="Aún no has registrado tickets"
      ayudaVacio="Cuando reportes algo aparecerá aquí con su seguimiento."
      (abrir)="abierto.set($event)" />

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

  constructor() {
    this.api.catalogos().subscribe({ next: (c) => this.catalogos.set(c) });
    this.cargar();
  }

  cargar() {
    this.api.listar().subscribe({
      next: (t) => this.tickets.set(t),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
