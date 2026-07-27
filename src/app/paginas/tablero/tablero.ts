import { Component, computed, inject, signal } from '@angular/core';
import { TicketsService } from '../../core/tickets.service';
import { duracion, mensajeError, NOMBRE_PRIORIDAD } from '../../core/formato';
import type { LineaTraza, Tablero as DatosTablero } from '../../core/modelos';

/** §13 · Tablero. Tres bloques: rezago, desempeño y justificación de compras. */
@Component({
  selector: 'app-tablero',
  templateUrl: './tablero.html',
})
export class Tablero {
  private readonly api = inject(TicketsService);

  readonly datos = signal<DatosTablero | null>(null);
  readonly traza = signal<LineaTraza[]>([]);
  readonly verTraza = signal(false);
  readonly error = signal('');

  readonly dur = duracion;
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;

  /** Escala de las barras: el mayor valor ocupa el 100 %. */
  readonly maxPrioridad = computed(() =>
    Math.max(1, ...(this.datos()?.rezago.por_prioridad ?? []).map((p) => p.n)),
  );
  readonly maxDependencia = computed(() =>
    Math.max(1, ...(this.datos()?.compras.dependencias ?? []).map((d) => d.tickets)),
  );

  /** Solo se listan técnicos con carga: el resto ensucia la lectura. */
  readonly conCarga = computed(() =>
    (this.datos()?.desempeno ?? []).filter((d) => d.abiertos || d.atendidos),
  );

  constructor() {
    this.api.tablero().subscribe({
      next: (d) => this.datos.set(d),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  alternarTraza() {
    this.verTraza.update((v) => !v);
    if (this.verTraza() && !this.traza().length) {
      this.api.traza().subscribe({ next: (t) => this.traza.set(t) });
    }
  }

  colorCobertura(disponibles: number): string {
    if (disponibles === 0) return 'var(--p1)';
    if (disponibles === 1) return 'var(--p2)';
    return '#2f9e75';
  }
}
