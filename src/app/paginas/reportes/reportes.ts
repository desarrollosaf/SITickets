import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { DonaChart } from '../../comp/dona-chart';
import { TendenciaChart } from '../../comp/tendencia-chart';
import { TicketsService, type FiltrosTicket } from '../../core/tickets.service';
import { mensajeError } from '../../core/formato';
import type { Catalogos, ReporteDatos, Tecnico } from '../../core/modelos';

/** Reporte para el administrador: graficas en pantalla y descarga en excel, ambas con los mismos filtros. */
@Component({
  selector: 'app-reportes',
  imports: [FormsModule, DonaChart, TendenciaChart],
  templateUrl: './reportes.html',
})
export class Reportes {
  private readonly api = inject(TicketsService);

  readonly catalogos = signal<Catalogos | null>(null);
  readonly tecnicos = signal<Tecnico[]>([]);
  readonly generando = signal(false);
  readonly error = signal('');

  readonly datos = signal<ReporteDatos | null>(null);
  readonly cargandoDatos = signal(false);

  /* Cadenas vacias, no undefined: así los select muestran la opción «Todos». */
  filtros: FiltrosTicket = { servicio: '', estatus: '', prioridad: '', tecnico: '' };

  /** Nombre del catalogo de estatus/prioridad, para no mostrar la clave pelona en las graficas. */
  private readonly nombreEstatus = computed(() => {
    const cat = this.catalogos()?.estatus ?? [];
    return (clave: string) => cat.find((e) => e.clave === clave)?.nombre ?? clave;
  });
  private readonly nombrePrioridad = computed(() => {
    const cat = this.catalogos()?.prioridades ?? [];
    return (clave: string) => cat.find((p) => p.clave === clave)?.nombre ?? clave;
  });

  readonly etiquetasEstatus = computed(() =>
    (this.datos()?.por_estatus ?? []).map((c) => this.nombreEstatus()(c.clave)),
  );
  readonly valoresEstatus = computed(() => (this.datos()?.por_estatus ?? []).map((c) => c.total));

  readonly etiquetasPrioridad = computed(() =>
    (this.datos()?.por_prioridad ?? []).map((c) => `${c.clave} · ${this.nombrePrioridad()(c.clave)}`),
  );
  readonly valoresPrioridad = computed(() => (this.datos()?.por_prioridad ?? []).map((c) => c.total));

  /** Aqui «clave» ya es el nombre del servicio (lo manda asi el backend), no hace falta mapearlo. */
  readonly etiquetasServicio = computed(() => (this.datos()?.por_servicio ?? []).map((c) => c.clave));
  readonly valoresServicio = computed(() => (this.datos()?.por_servicio ?? []).map((c) => c.total));

  readonly etiquetasTendencia = computed(() =>
    (this.datos()?.tendencia_mensual ?? []).map((m) => m.mes),
  );
  readonly valoresTendencia = computed(() =>
    (this.datos()?.tendencia_mensual ?? []).map((m) => m.total),
  );

  constructor() {
    forkJoin({ catalogos: this.api.catalogos(), tecnicos: this.api.tecnicos() }).subscribe({
      next: (r) => {
        this.catalogos.set(r.catalogos);
        this.tecnicos.set(r.tecnicos);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.cargarDatos();
  }

  /** Se llama cada vez que cambia un select: las graficas reaccionan al filtro elegido. */
  cargarDatos() {
    this.cargandoDatos.set(true);
    this.api.reporteDatos(this.filtros).subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargandoDatos.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargandoDatos.set(false);
      },
    });
  }

  limpiar() {
    this.filtros = { servicio: '', estatus: '', prioridad: '', tecnico: '' };
    this.cargarDatos();
  }

  generar() {
    this.error.set('');
    this.generando.set(true);
    this.api.reporteExcel(this.filtros).subscribe({
      next: (blob) => {
        this.generando.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-tickets-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.generando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}
