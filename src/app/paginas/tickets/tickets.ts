import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { AuthService } from '../../core/auth.service';
import { TicketsService, type FiltrosTicket } from '../../core/tickets.service';
import { mensajeError, paginasConSalto, quitarAcentos } from '../../core/formato';
import type { Catalogos, Tecnico, Ticket } from '../../core/modelos';

/**
 * Una pestaña por estatus, en el orden del ciclo de vida. "En cola" va aparte
 * aunque en la base sea REGISTRADO: es lo que el area tiene que atender ya.
 * Los colores son los del chip de cada estatus (styles.scss).
 */
const PESTANAS = [
  { clave: 'TODOS', texto: 'Todos', icono: 'bi-collection', tono: '#45566b' },
  { clave: 'EN_COLA', texto: 'En cola', icono: 'bi-exclamation-octagon', tono: '#c0392b' },
  { clave: 'REGISTRADO', texto: 'Registrado', icono: 'bi-inbox', tono: '#5b6b7c' },
  { clave: 'ASIGNADO', texto: 'Asignado', icono: 'bi-person-check', tono: '#2b6cb0' },
  { clave: 'EN_ATENCION', texto: 'En atención', icono: 'bi-tools', tono: '#0f8a8a' },
  { clave: 'EN_ESPERA', texto: 'En espera', icono: 'bi-pause-circle', tono: '#d17b1f' },
  { clave: 'RESUELTO', texto: 'Resuelto', icono: 'bi-hourglass-split', tono: '#6d35c9' },
  { clave: 'CERRADO', texto: 'Cerrado', icono: 'bi-check2-circle', tono: '#1f8a56' },
  { clave: 'CANCELADO', texto: 'Cancelado', icono: 'bi-x-circle', tono: '#77808c' },
] as const;

type Pestana = (typeof PESTANAS)[number]['clave'];

/** Misma regla que el chip de estatus: si esta en cola, cuenta como "En cola". */
function pestanaDe(t: Ticket): Pestana {
  return t.en_cola ? 'EN_COLA' : (t.estatus as Pestana);
}

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

  readonly pestanas = PESTANAS;
  readonly pestana = signal<Pestana>('TODOS');

  /**
   * Caso especial, solo esta persona (ver USUARIOS_CIERRE_SERVICIO en el
   * backend): cuantos de sus tickets (ya acotados a CARTAS DE NO ADEUDO)
   * estan en RESUELTO esperando que ella los confirme.
   */
  private readonly USUARIOS_CIERRE_ESPECIAL = [38];
  readonly esCierreEspecial = computed(() =>
    this.USUARIOS_CIERRE_ESPECIAL.includes(this.auth.usuario()?.id ?? -1),
  );
  readonly porConfirmar = computed(() => this.tickets().filter((t) => t.estatus === 'RESUELTO'));

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
  /**
   * Un solo buscador para todo, folio incluido (antes el folio iba aparte y
   * al servidor; la lista ya trae folio y folio_general, no hace falta).
   * Por palabras: "bustamante santander" exige las dos, en cualquier campo.
   * Va antes de repartir en pestañas: asi el contador de cada una dice donde
   * hay coincidencias aunque no sea la que esta abierta.
   */
  ticketsBuscados() {
    const palabras = quitarAcentos(this.busquedaTexto.trim().toLowerCase()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return this.tickets();
    return this.tickets().filter((t) => {
      const texto = quitarAcentos(
        [
          t.folio,
          t.folio_general,
          t.solicitante,
          t.dependencia,
          t.servicio,
          t.problema,
          t.contexto,
          t.tecnico,
          t.edificio_atencion,
          t.registrado_por_nombre,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      );
      return palabras.every((p) => texto.includes(p));
    });
  }

  ticketsFiltrados() {
    const p = this.pestana();
    const lista = this.ticketsBuscados();
    return p === 'TODOS' ? lista : lista.filter((t) => pestanaDe(t) === p);
  }

  conteo(): Record<string, number> {
    const lista = this.ticketsBuscados();
    const c: Record<string, number> = { TODOS: lista.length };
    for (const t of lista) {
      const p = pestanaDe(t);
      c[p] = (c[p] ?? 0) + 1;
    }
    return c;
  }

  cambiarPestana(p: Pestana) {
    this.pestana.set(p);
    this.paginaActual.set(1);
  }

  /** Los boletos no tienen encabezados que clicar: el orden se elige aqui. */
  cambiarOrden(valor: string) {
    if (valor === 'prioridad' || valor === 'tiempo') {
      this.ordenPor.set(null);
      this.ordenar(valor);
    } else {
      this.ordenPor.set(null);
      this.paginaActual.set(1);
    }
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

  desde() {
    return (this.paginaActual() - 1) * this.porPagina + 1;
  }

  hasta() {
    return Math.min(this.paginaActual() * this.porPagina, this.ticketsFiltrados().length);
  }

  paginas() {
    return paginasConSalto(this.totalPaginas(), this.paginaActual());
  }

  irAPagina(pagina: number) {
    this.paginaActual.set(Math.min(this.totalPaginas(), Math.max(1, pagina)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
