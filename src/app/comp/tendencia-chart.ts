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
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** Barras de tickets registrados por mes, para «Tendencia mensual» en el reporte. */
@Component({
  selector: 'app-tendencia-chart',
  template: `
    <div class="tarjeta p-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h3 class="h6 mb-0">Tendencia mensual de registro</h3>
        @if (etiquetas().length) {
          <span class="chip" style="background: #eef1f4; color: var(--tinta-2)">
            {{ etiquetas().length }} periodo(s)
          </span>
        }
      </div>
      @if (!etiquetas().length) {
        <p class="sub text-center py-5 mb-0">Sin datos con estos filtros.</p>
      } @else {
        <div style="height: 220px">
          <canvas #lienzo></canvas>
        </div>
      }
    </div>
  `,
})
export class TendenciaChart implements OnDestroy {
  readonly etiquetas = input.required<string[]>();
  readonly valores = input.required<number[]>();

  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');
  private grafica?: Chart<'bar'>;

  readonly hayDatos = computed(() => this.etiquetas().length > 0);

  constructor() {
    effect(() => {
      const lienzo = this.lienzo();
      const etiquetas = this.etiquetas();
      const valores = this.valores();
      if (!lienzo || !etiquetas.length) return;

      /*
       * El @if de la plantilla quita el <canvas> del DOM cuando no hay
       * periodos (y pone otro nuevo si vuelven a aparecer datos): la
       * instancia vieja de Chart.js queda apuntando a un canvas que ya no
       * existe. Hay que destruirla y crear una nueva sobre el canvas actual.
       */
      if (this.grafica && this.grafica.canvas !== lienzo.nativeElement) {
        this.grafica.destroy();
        this.grafica = undefined;
      }

      if (this.grafica) {
        this.grafica.data.labels = etiquetas;
        this.grafica.data.datasets[0].data = valores;
        this.grafica.update();
        return;
      }

      const config: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
          labels: etiquetas,
          datasets: [
            {
              data: valores,
              backgroundColor: '#2563eb',
              borderRadius: 4,
              maxBarThickness: 28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
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
