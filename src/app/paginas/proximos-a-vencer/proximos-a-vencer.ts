import { Component, computed, inject, signal } from '@angular/core';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, paginasConSalto, quitarAcentos } from '../../core/formato';
import type { Catalogos, Ticket } from '../../core/modelos';

/**
 * Tickets abiertos que van al 70% o mas de su objetivo de prioridad sin
 * haberlo vencido todavia (ver proximosAVencer() en tickets.service.ts del
 * backend). Vienen ya ordenados del mas urgente al menos urgente. IMPA queda
 * fuera: su tiempo depende del proveedor externo, no de quien lo tiene
 * asignado aqui. Mismo formato de vista que /tickets (boletos + paginador).
 */
@Component({
  selector: 'app-proximos-a-vencer',
  imports: [TablaTickets, DetalleTicket],
  templateUrl: './proximos-a-vencer.html',
})
export class ProximosAVencer {
  private readonly api = inject(TicketsService);

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly abierto = signal<number | null>(null);
  readonly error = signal('');
  readonly cargando = signal(true);
  readonly busqueda = signal('');

  readonly filtrados = computed(() => {
    const q = quitarAcentos(this.busqueda().trim().toLowerCase());
    if (!q) return this.tickets();
    const palabras = q.split(/\s+/);
    return this.tickets().filter((t) => {
      const texto = quitarAcentos(
        [t.folio, t.folio_general, t.problema, t.servicio, t.tecnico, t.dependencia]
          .filter(Boolean)
          .join(' '),
      );
      return palabras.every((p) => texto.includes(p));
    });
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
  readonly ticketsPagina = computed(() => this.filtrados().slice(this.desde() - 1, this.hasta()));
  readonly paginas = computed(() => paginasConSalto(this.totalPaginas(), this.paginaActual()));

  constructor() {
    this.api.catalogos().subscribe({ next: (c) => this.catalogos.set(c) });
    this.cargar();
  }

  irAPagina(n: number) {
    this.paginaActual.set(Math.min(Math.max(1, n), this.totalPaginas()));
  }

  buscar(texto: string) {
    this.busqueda.set(texto);
    this.paginaActual.set(1);
  }

  cargar() {
    this.cargando.set(true);
    this.api.proximosAVencer().subscribe({
      next: (t) => {
        this.tickets.set(t);
        this.paginaActual.set(1);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
