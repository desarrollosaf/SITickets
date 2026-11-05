import { Component, computed, inject, signal } from '@angular/core';
import { TicketsService } from '../../core/tickets.service';
import { etiquetaEstatus, mensajeError } from '../../core/formato';
import type { CargaTrabajo as DatosCargaTrabajo } from '../../core/modelos';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

type TicketCelda = { folio: string; servicio: string; problema: string; estatus: string };

interface Tooltip {
  x: number;
  y: number;
  arriba: boolean;
  tickets: (TicketCelda & { estatusTexto: string; estatusClase: string })[];
}

/**
 * Carga de trabajo: cuantos tickets se le asignaron a cada tecnico, dia por
 * dia, para ver de un vistazo quien trae mas carga y si hubo algun dia con
 * una avalancha sobre una sola persona.
 */
@Component({
  selector: 'app-carga-trabajo',
  templateUrl: './carga-trabajo.html',
})
export class CargaTrabajo {
  private readonly api = inject(TicketsService);

  readonly datos = signal<DatosCargaTrabajo | null>(null);
  readonly error = signal('');
  readonly cargando = signal(true);

  /** El mayor valor de toda la tabla: la escala del color de fondo se calcula contra el. */
  readonly maximo = computed(() =>
    Math.max(1, ...(this.datos()?.tecnicos ?? []).flatMap((t) => t.por_dia.map((d) => d.length))),
  );

  /** Solo se listan tecnicos con algo que mostrar: el resto ensucia la lectura. */
  readonly conCarga = computed(() =>
    (this.datos()?.tecnicos ?? []).filter((t) => t.total_periodo || t.abiertos_hoy),
  );

  readonly totalesPorDia = computed(() => {
    const d = this.datos();
    if (!d) return [];
    return d.dias.map((_, i) => d.tecnicos.reduce((a, t) => a + (t.por_dia[i]?.length ?? 0), 0));
  });

  /** Claves de servicio que de verdad aparecen en la tabla, para la leyenda de abajo. */
  readonly leyendaServicios = computed(() => {
    const vistos = new Map<string, string>();
    for (const t of this.datos()?.tecnicos ?? []) {
      for (const s of t.especialidad) vistos.set(s.clave, s.nombre);
    }
    return [...vistos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clave, nombre]) => ({ clave, nombre }));
  });

  readonly tooltip = signal<Tooltip | null>(null);
  /** Pequeño margen antes de cerrar: le da tiempo al mouse de "cruzar" de la celda al tooltip. */
  private cierrePendiente?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.api.cargaTrabajo().subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  /** "2026-11-05" -> "mié 05 nov", para el encabezado de cada columna. */
  etiquetaDia(iso: string): { dia: string; corto: string; esFinde: boolean } {
    const [y, m, d] = iso.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    return {
      dia: dias[fecha.getDay()],
      corto: `${String(d).padStart(2, '0')} ${MESES[m - 1]}`,
      esFinde: fecha.getDay() === 0 || fecha.getDay() === 6,
    };
  }

  /** Intensidad del azul segun que tan cerca esta del maximo de toda la tabla. */
  colorCelda(valor: number): string {
    if (!valor) return 'transparent';
    const intensidad = Math.min(1, valor / this.maximo());
    const alfa = 0.12 + intensidad * 0.68;
    return `rgba(37, 99, 235, ${alfa.toFixed(2)})`;
  }

  colorTexto(valor: number): string {
    if (!valor) return 'var(--tinta-2)';
    const intensidad = Math.min(1, valor / this.maximo());
    return intensidad > 0.55 ? '#fff' : 'var(--tinta)';
  }

  /**
   * Tooltip propio (no el title nativo del navegador) para poder darle
   * diseño: una tarjeta oscura con un renglón por ticket, estatus coloreado
   * igual que en el resto de la app. Se posiciona en coordenadas de
   * viewport (position: fixed) para no quedar cortado por el scroll
   * horizontal de la tabla.
   */
  mostrarTooltip(ev: MouseEvent, tickets: TicketCelda[]) {
    this.cancelarCierre();
    if (!tickets.length) {
      this.tooltip.set(null);
      return;
    }
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const arriba = rect.top > 200;
    this.tooltip.set({
      x: rect.left + rect.width / 2,
      y: arriba ? rect.top - 8 : rect.bottom + 8,
      arriba,
      tickets: tickets.map((t) => {
        const { texto, clase } = etiquetaEstatus({ estatus: t.estatus, en_cola: false });
        return { ...t, estatusTexto: texto, estatusClase: clase };
      }),
    });
  }

  /**
   * No se cierra al instante: el cursor tiene que viajar de la celda al
   * tooltip (que esta separado, con position: fixed) y ese trayecto ya
   * dispara el mouseleave de la celda. Un margen corto le da tiempo de
   * "aterrizar" en el tooltip antes de que desaparezca; mostrarTooltip() y
   * cancelarCierre() lo cancelan si el cursor si llego.
   */
  ocultarTooltip() {
    this.cancelarCierre();
    this.cierrePendiente = setTimeout(() => this.tooltip.set(null), 150);
  }

  cancelarCierre() {
    clearTimeout(this.cierrePendiente);
  }
}
