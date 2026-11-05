import {
  Component,
  computed,
  effect,
  input,
  OnDestroy,
  viewChild,
  type ElementRef,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

/** Misma paleta que la dona (dona-chart.ts): un color fijo por servicio en toda la vista. */
const PALETA = [
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#e11d48',
  '#9333ea',
  '#06b6d4',
  '#db2777',
  '#ca8a04',
  '#0d9488',
  '#4f46e5',
];

export interface SerieServicio {
  nombre: string;
  datos: number[];
}

/** Barras agrupadas de tickets registrados por semana, una barra por servicio. */
@Component({
  selector: 'app-tendencia-semanal-chart',
  template: `
    <div class="tarjeta p-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h3 class="h6 mb-0">Tendencia semanal por servicio</h3>
        @if (semanas().length) {
          <span class="chip" style="background: #eef1f4; color: var(--tinta-2)">
            Últimas {{ semanas().length }} semana(s)
          </span>
        }
      </div>
      @if (!semanas().length) {
        <p class="sub text-center py-5 mb-0">Sin datos con estos filtros.</p>
      } @else {
        <div style="height: 260px">
          <canvas #lienzo></canvas>
        </div>
      }
    </div>
  `,
})
export class TendenciaSemanalChart implements OnDestroy {
  /** Lunes de cada semana, formato YYYY-MM-DD. */
  readonly semanas = input.required<string[]>();
  readonly servicios = input.required<SerieServicio[]>();

  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');
  private grafica?: Chart<'bar'>;

  readonly hayDatos = computed(() => this.semanas().length > 0);

  /** "2026-11-03" -> "03 nov", mas legible que la fecha ISO completa. */
  private etiquetaSemana(semana: string): string {
    const [, mes, dia] = semana.split('-');
    const meses = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
    ];
    return `${dia} ${meses[Number(mes) - 1] ?? mes}`;
  }

  constructor() {
    effect(() => {
      const lienzo = this.lienzo();
      const semanas = this.semanas();
      const servicios = this.servicios();
      if (!lienzo || !semanas.length) return;

      const etiquetas = semanas.map((s) => this.etiquetaSemana(s));
      const datasets = servicios.map((s, i) => ({
        label: s.nombre,
        data: s.datos,
        backgroundColor: PALETA[i % PALETA.length],
        maxBarThickness: 28,
      }));

      /* El @if de la plantilla quita el <canvas> cuando no hay semanas: la
         instancia vieja queda apuntando a un canvas que ya no existe. */
      if (this.grafica && this.grafica.canvas !== lienzo.nativeElement) {
        this.grafica.destroy();
        this.grafica = undefined;
      }

      if (this.grafica) {
        this.grafica.data.labels = etiquetas;
        this.grafica.data.datasets = datasets;
        this.grafica.update();
        return;
      }

      const config: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: { labels: etiquetas, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      };
      this.grafica = new Chart(lienzo.nativeElement, config);
    });
  }

  ngOnDestroy() {
    this.grafica?.destroy();
  }
}
