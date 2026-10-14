import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { AuthService } from '../../core/auth.service';
import { TicketsService, type FiltrosTicket } from '../../core/tickets.service';
import { mensajeError, quitarAcentos } from '../../core/formato';
import type { Catalogos, Tecnico, Ticket } from '../../core/modelos';

@Component({
  selector: 'app-tickets',
  imports: [FormsModule, TablaTickets, DetalleTicket],
  templateUrl: './tickets.html',
})
export class Tickets {
  private readonly api = inject(TicketsService);
  private readonly auth = inject(AuthService);

  /** Gestor/validador solo buscan por nombre/folio: el resto de filtros es jerga operativa que no les toca. */
  readonly esAdminUOperador = computed(() => ['admin', 'operador'].includes(this.auth.rol() ?? ''));

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly tecnicos = signal<Tecnico[]>([]);
  readonly abierto = signal<number | null>(null);
  readonly cargando = signal(true);
  readonly error = signal('');

  /* Cadenas vacias, no undefined: así los select muestran la opción «Todos». Esta vista esta
   * restringida a admin/operador/gestor/validador por el guard de la ruta (app.routes.ts); el
   * backend acota lo que cada rol ve (alcance() en tickets.service.ts), así que el buscador
   * por folio no necesita gating adicional aquí. */
  filtros: FiltrosTicket = { servicio: '', estatus: '', prioridad: '', tecnico: '', folio: '' };

  /* Buscador por nombre/servicio/asunto: filtra client-side sobre lo que ya
   * trajo el API (que viene topado a 500 filas), no golpea el backend de
   * nuevo en cada letra. */
  busquedaTexto = '';
  readonly porPagina = 10;
  readonly paginaActual = signal(1);

  /* Orden por columna: se aplica antes de paginar, no sobre los 10 ya
   * recortados, o el orden solo se veria dentro de cada pagina. */
  readonly ordenPor = signal<'prioridad' | 'tiempo' | null>(null);
  readonly ordenDir = signal<'asc' | 'desc'>('desc');

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
        this.paginaActual.set(1);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  limpiar() {
    this.filtros = { servicio: '', estatus: '', prioridad: '', tecnico: '', folio: '' };
    this.busquedaTexto = '';
    this.cargar();
  }

  /** Metodo normal, no computed(): busquedaTexto es una propiedad plana que cambia por ngModel. */
  ticketsFiltrados() {
    const texto = quitarAcentos(this.busquedaTexto.trim().toLowerCase());
    if (!texto) return this.tickets();
    return this.tickets().filter(
      (t) =>
        quitarAcentos(t.solicitante.toLowerCase()).includes(texto) ||
        quitarAcentos(t.servicio.toLowerCase()).includes(texto) ||
        quitarAcentos(t.problema.toLowerCase()).includes(texto) ||
        quitarAcentos((t.contexto ?? '').toLowerCase()).includes(texto),
    );
  }

  onBuscarTexto() {
    this.paginaActual.set(1);
  }

  ordenar(columna: 'prioridad' | 'tiempo') {
    if (this.ordenPor() === columna) {
      this.ordenDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.ordenPor.set(columna);
      /* Prioridad arranca ascendente (P1 primero, lo mas urgente). Tiempo
       * arranca descendente (lo que lleva mas tiempo abierto primero). */
      this.ordenDir.set(columna === 'prioridad' ? 'asc' : 'desc');
    }
    this.paginaActual.set(1);
  }

  /** Metodo normal, no computed(): depende de signals leidos directo (ordenPor/ordenDir). */
  ticketsOrdenados() {
    const columna = this.ordenPor();
    const lista = this.ticketsFiltrados();
    if (!columna) return lista;
    const signo = this.ordenDir() === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (columna === 'prioridad') return signo * a.prioridad.localeCompare(b.prioridad);
      return signo * (a.min_activo - b.min_activo);
    });
  }

  totalPaginas() {
    return Math.max(1, Math.ceil(this.ticketsFiltrados().length / this.porPagina));
  }

  ticketsPagina() {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.ticketsOrdenados().slice(inicio, inicio + this.porPagina);
  }

  paginaAnterior() {
    this.paginaActual.update((p) => Math.max(1, p - 1));
  }

  paginaSiguiente() {
    this.paginaActual.update((p) => Math.min(this.totalPaginas(), p + 1));
  }
}
