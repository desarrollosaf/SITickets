import { Component, inject, signal } from '@angular/core';
import { TicketsService } from '../../core/tickets.service';
import { fecha, mensajeError } from '../../core/formato';
import type { Ticket } from '../../core/modelos';

/** Tickets de EQUIPO DE CÓMPUTO donde el técnico dictaminó la baja del equipo. Solo administrador. */
@Component({
  selector: 'app-bajas',
  templateUrl: './bajas.html',
})
export class Bajas {
  private readonly api = inject(TicketsService);

  readonly tickets = signal<Ticket[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly fmt = fecha;

  constructor() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.api.listar({ resultado_cmp: 'baja' }).subscribe({
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

  /** Abre el dictamen en una pestaña nueva. */
  verDictamen(id: number) {
    this.api.descargarDictamen(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
