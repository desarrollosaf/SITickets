import { Component, computed, inject, signal } from '@angular/core';
import { TicketsService } from '../../core/tickets.service';
import { esFinDeSemana, iso, mensajeError } from '../../core/formato';
import type { Agenda } from '../../core/modelos';

/**
 * §8 · Calendario de disponibilidad. Un día bloqueado saca al técnico de la
 * asignación automática; si es el único de su especialidad, los tickets de ese
 * servicio caen en cola.
 */
@Component({
  selector: 'app-disponibilidad',
  templateUrl: './disponibilidad.html',
})
export class Disponibilidad {
  private readonly api = inject(TicketsService);

  readonly agenda = signal<Agenda>({ tecnicos: [], bloqueos: [] });
  readonly error = signal('');
  readonly guardando = signal(false);

  /** Dos días atrás y doce adelante: la ventana que se planea en la práctica. */
  readonly dias = computed(() =>
    Array.from({ length: 14 }, (_, i) => new Date(Date.now() + (i - 2) * 86_400_000)),
  );

  private readonly bloqueados = computed(
    () => new Set(this.agenda().bloqueos.map((b) => `${b.usuario_id}|${b.fecha}`)),
  );

  readonly iso = iso;
  readonly finde = esFinDeSemana;

  constructor() {
    this.cargar();
  }

  cargar() {
    this.api.agenda().subscribe({
      next: (a) => this.agenda.set(a),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  bloqueado(usuarioId: number, d: Date): boolean {
    return this.bloqueados().has(`${usuarioId}|${iso(d)}`);
  }

  alternar(usuarioId: number, d: Date) {
    if (esFinDeSemana(d) || this.guardando()) return;

    const fecha = iso(d);
    const quitar = this.bloqueado(usuarioId, d);
    this.guardando.set(true);

    this.api.alternarDia({ usuario: usuarioId, fecha, quitar, tipo: 'vacaciones' }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  etiquetaDia(d: Date): string {
    return d.toLocaleDateString('es-MX', { weekday: 'narrow' });
  }
}
