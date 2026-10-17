import { Component, computed, inject, signal } from '@angular/core';
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
  /* El boleto aqui no se abre al dar clic: las acciones son sus botones. */
  styles: `
    .boleto-fijo { cursor: default; }
    .boleto-fijo .boleto-talon { justify-content: space-between; flex-wrap: wrap; }
  `,
})
export class TicketsPorValidar {
  private readonly api = inject(TicketsService);

  readonly tickets = signal<Ticket[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly fmt = fecha;

  readonly busqueda = signal('');

  /** Minusculas y sin acentos, por palabras: "garrido osf" encuentra ambos. */
  readonly filtrados = computed(() => {
    const normalizar = (x: string) =>
      x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const palabras = normalizar(this.busqueda().trim()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return this.tickets();
    return this.tickets().filter((t) => {
      const texto = normalizar(
        [
          t.folio,
          t.problema,
          t.servicio,
          t.solicitante,
          t.dependencia,
          t.registrado_por_nombre,
          t.edificio_atencion,
          t.contexto,
          t.modelo_traslado,
          t.color_toner,
        ]
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

  /** Primera, ultima y las vecinas de la actual; null pinta "…". */
  readonly paginas = computed(() => {
    const total = this.totalPaginas();
    const actual = this.paginaActual();
    const lista: (number | null)[] = [];
    for (let n = 1; n <= total; n++) {
      if (n === 1 || n === total || Math.abs(n - actual) <= 1) lista.push(n);
      else if (lista[lista.length - 1] !== null) lista.push(null);
    }
    return lista;
  });

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

  buscar(texto: string) {
    this.busqueda.set(texto);
    this.paginaActual.set(1);
  }

  irA(n: number) {
    this.paginaActual.set(Math.min(Math.max(1, n), this.totalPaginas()));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private cargar() {
    this.cargando.set(true);
    this.api.porValidar().subscribe({
      next: (t) => {
        this.tickets.set(t);
        /* Al aprobar el ultimo de una pagina, no quedarse en una pagina vacia. */
        this.paginaActual.set(Math.min(this.paginaActual(), this.totalPaginas()));
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
