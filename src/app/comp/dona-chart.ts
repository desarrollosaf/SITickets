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
  ArcElement,
  Chart,
  DoughnutController,
  Legend,
  Tooltip,
  type ChartConfiguration,
  type Plugin,
} from 'chart.js';

Chart.register(ArcElement, DoughnutController, Tooltip, Legend);

/** Paleta viva y saturada: aqui la prioridad es distinguir categorias de un vistazo, no ser sobria. */
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

/** Dibuja el total al centro de la dona, como en el reporte de referencia. */
const textoCentral: Plugin<'doughnut'> = {
  id: 'textoCentral',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const total = (chart.data.datasets[0]?.data as number[]).reduce((a, b) => a + b, 0);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#1b2434';
    ctx.fillText(String(total), cx, cy - 8);
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#5c6a7e';
    ctx.fillText('Total', cx, cy + 12);
    ctx.restore();
  },
};

/** Dona con leyenda (etiqueta, cuenta, %), igual estilo al usado en el reporte de tickets. */
@Component({
  selector: 'app-dona-chart',
  template: `
    <div class="tarjeta p-3 h-100 d-flex flex-column">
      <h3 class="h6 mb-3">{{ titulo() }}</h3>
      @if (!total()) {
        <p class="sub text-center py-5 mb-0">Sin datos con estos filtros.</p>
      } @else {
        <div class="mx-auto" style="width: 170px; height: 170px">
          <canvas #lienzo></canvas>
        </div>
        <div class="mt-3 d-flex flex-column gap-2">
          @for (i of indices(); track i) {
            <div class="d-flex align-items-center gap-2" style="font-size: 0.8rem">
              <span
                class="rounded-circle flex-shrink-0"
                [style.background]="color(i)"
                style="width: 10px; height: 10px"
              ></span>
              <span class="flex-grow-1 text-truncate">{{ etiquetas()[i] }}</span>
              <span class="fw-semibold">{{ valores()[i] }}</span>
              <span class="sub" style="width: 32px; text-align: right">{{ porcentaje(i) }}%</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class DonaChart implements OnDestroy {
  readonly titulo = input.required<string>();
  readonly etiquetas = input.required<string[]>();
  readonly valores = input.required<number[]>();

  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');
  private grafica?: Chart<'doughnut'>;

  readonly total = computed(() => this.valores().reduce((a, b) => a + b, 0));
  readonly indices = computed(() => this.valores().map((_, i) => i));

  color(i: number): string {
    return PALETA[i % PALETA.length];
  }

  porcentaje(i: number): number {
    const t = this.total();
    return t ? Math.round((this.valores()[i] / t) * 100) : 0;
  }

  constructor() {
    effect(() => {
      const lienzo = this.lienzo();
      const etiquetas = this.etiquetas();
      const valores = this.valores();
      if (!lienzo) return;

      /*
       * El @if de la plantilla quita el <canvas> del DOM cuando total() pasa
       * a 0 (y pone otro nuevo si vuelve a haber datos): la instancia vieja
       * de Chart.js queda apuntando a un canvas que ya no existe. Hay que
       * destruirla y crear una nueva sobre el canvas actual, no reusarla.
       */
      if (this.grafica && this.grafica.canvas !== lienzo.nativeElement) {
        this.grafica.destroy();
        this.grafica = undefined;
      }

      if (this.grafica) {
        this.grafica.data.labels = etiquetas;
        this.grafica.data.datasets[0].data = valores;
        this.grafica.data.datasets[0].backgroundColor = valores.map((_, i) => this.color(i));
        this.grafica.update();
        return;
      }

      const config: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',
        data: {
          labels: etiquetas,
          datasets: [
            {
              data: valores,
              backgroundColor: valores.map((_, i) => this.color(i)),
              borderWidth: 0,
            },
          ],
        },
        options: {
          cutout: '70%',
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
        },
        plugins: [textoCentral],
      };
      this.grafica = new Chart(lienzo.nativeElement, config);
    });
  }

  ngOnDestroy() {
    this.grafica?.destroy();
  }
}
