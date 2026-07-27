import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { TicketsService, type FiltrosTicket } from '../../core/tickets.service';
import { mensajeError } from '../../core/formato';
import type { Catalogos, Tecnico, Ticket } from '../../core/modelos';

@Component({
  selector: 'app-tickets',
  imports: [FormsModule, TablaTickets, DetalleTicket],
  templateUrl: './tickets.html',
})
export class Tickets {
  private readonly api = inject(TicketsService);

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly tecnicos = signal<Tecnico[]>([]);
  readonly abierto = signal<number | null>(null);
  readonly cargando = signal(true);
  readonly error = signal('');

  /* Cadenas vacias, no undefined: así los select muestran la opción «Todos». */
  filtros: FiltrosTicket = { servicio: '', estatus: '', prioridad: '', tecnico: '' };

  constructor() {
    forkJoin({ catalogos: this.api.catalogos(), tecnicos: this.api.tecnicos() }).subscribe({
      next: (r) => {
        this.catalogos.set(r.catalogos);
        this.tecnicos.set(r.tecnicos);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.api.listar(this.filtros).subscribe({
      next: (t) => {
        this.tickets.set(t);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  limpiar() {
    this.filtros = { servicio: '', estatus: '', prioridad: '', tecnico: '' };
    this.cargar();
  }
}
