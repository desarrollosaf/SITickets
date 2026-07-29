import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TicketsService } from '../../core/tickets.service';
import { cronometro, duracion, mensajeError } from '../../core/formato';
import type { Monitor as DatosMonitor } from '../../core/modelos';

/**
 * §17 · Pantalla para proyectar en el área. Se refresca sola: quien la ve no
 * tiene teclado a la mano.
 */
@Component({
  selector: 'app-monitor',
  imports: [DatePipe],
  templateUrl: './monitor.html',
})
export class Monitor implements OnDestroy {
  private readonly api = inject(TicketsService);

  readonly datos = signal<DatosMonitor | null>(null);
  readonly error = signal('');
  readonly hora = signal(new Date());

  readonly crono = cronometro;
  readonly dur = duracion;

  /** Los cronómetros suben en pantalla sin volver a pedir datos al servidor. */
  private readonly segundero = setInterval(() => {
    this.hora.set(new Date());
    this.datos.update((d) =>
      d
        ? {
            ...d,
            atencion: d.atencion.map((a) =>
              a.reloj_desde ? { ...a, seg_campo: a.seg_campo + 1 } : a,
            ),
          }
        : d,
    );
  }, 1000);

  private readonly refresco = setInterval(() => this.cargar(), 3000);

  constructor() {
    this.cargar();
  }

  ngOnDestroy() {
    clearInterval(this.segundero);
    clearInterval(this.refresco);
  }

  cargar() {
    this.api.monitor().subscribe({
      next: (d) => this.datos.set(d),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  pantallaCompleta() {
    const el = document.getElementById('tablero-monitor');
    if (el) void el.requestFullscreen?.();
  }
}
