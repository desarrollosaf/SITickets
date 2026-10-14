import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { fecha, mensajeError } from '../../core/formato';
import type { Ticket } from '../../core/modelos';

/**
 * §16 · bandeja del validador: tickets que un gestor registro en una
 * dependencia que este usuario valida, congelados (sin tecnico, sin SLA)
 * hasta Aprobar o Rechazar.
 */
@Component({
  selector: 'app-tickets-por-validar',
  imports: [FormsModule],
  templateUrl: './tickets-por-validar.html',
})
export class TicketsPorValidar {
  private readonly api = inject(TicketsService);

  readonly tickets = signal<Ticket[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly fmt = fecha;

  /** id del ticket que se esta aprobando/rechazando, para deshabilitar sus botones. */
  readonly ocupado = signal<number | null>(null);

  readonly mostrarRechazo = signal(false);
  readonly ticketARechazar = signal<Ticket | null>(null);
  motivo = '';
  readonly errorRechazo = signal('');
  readonly guardandoRechazo = signal(false);

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.cargando.set(true);
    this.api.porValidar().subscribe({
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

  /** El modelo vive en contexto (campo "Modelo de impresora") o en modelo_traslado (IMPA-09). */
  modelo(t: Ticket): string | null {
    return t.campo_adicional === 'Modelo de impresora' ? t.contexto : t.modelo_traslado;
  }

  aprobar(t: Ticket) {
    this.ocupado.set(t.id);
    this.error.set('');
    this.api.aprobarValidacion(t.id).subscribe({
      next: () => {
        this.ocupado.set(null);
        this.cargar();
      },
      error: (e) => {
        this.ocupado.set(null);
        this.error.set(mensajeError(e));
      },
    });
  }

  abrirRechazo(t: Ticket) {
    this.ticketARechazar.set(t);
    this.motivo = '';
    this.errorRechazo.set('');
    this.mostrarRechazo.set(true);
  }

  cerrarRechazo() {
    this.mostrarRechazo.set(false);
  }

  confirmarRechazo() {
    const t = this.ticketARechazar();
    if (!t) return;
    if (this.motivo.trim().length < 3) {
      this.errorRechazo.set('Explica por que se rechaza.');
      return;
    }
    this.guardandoRechazo.set(true);
    this.errorRechazo.set('');
    this.api.rechazarValidacion(t.id, this.motivo.trim()).subscribe({
      next: () => {
        this.guardandoRechazo.set(false);
        this.mostrarRechazo.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardandoRechazo.set(false);
        this.errorRechazo.set(mensajeError(e));
      },
    });
  }
}
