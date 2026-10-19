import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

export interface OpcionPildora {
  clave: string;
  texto: string;
  icono: string;
  /** Color de la pastilla activa; si falta, el azul de la marca. */
  tono?: string;
}

/**
 * Pestañas tipo pildora que nunca se parten en dos renglones: mide cuantas
 * caben y el resto lo agrupa en un menu "Más". La activa siempre queda a la
 * vista, aunque se haya elegido desde el menu.
 *
 * Para medir pinta una copia invisible de todas las pestañas (.pildoras-medida)
 * con el mismo estilo; asi el ancho de cada una se conoce aunque este oculta.
 */
@Component({
  selector: 'app-pildoras',
  host: {
    class: 'pildoras-host',
    '(document:click)': 'cerrarSiAfuera($event)',
    '(document:keydown.escape)': 'menuAbierto.set(false)',
  },
  template: `
    <div class="pildoras" role="tablist">
      @for (o of visibles(); track o.clave) {
        <button type="button" role="tab" class="pildora"
                [style.--tono]="o.tono" [style.--tono-2]="o.tono"
                [class.activa]="activa() === o.clave" [class.vacia]="!cuenta(o.clave)"
                [attr.aria-selected]="activa() === o.clave" (click)="elegir(o.clave)">
          <i class="bi" [class]="o.icono"></i>
          {{ o.texto }}
          <span class="pildora-cuenta">{{ cuenta(o.clave) }}</span>
        </button>
      }
      @if (ocultas().length) {
        <button #botonMas type="button" class="pildora pildora-mas" [class.abierto]="menuAbierto()"
                aria-haspopup="menu" [attr.aria-expanded]="menuAbierto()" (click)="alternarMenu()">
          Más <span class="pildora-cuenta">{{ ocultas().length }}</span>
          <i class="bi bi-chevron-down"></i>
        </button>
      }
    </div>

    @if (menuAbierto() && ocultas().length) {
      <div class="pildoras-menu" role="menu" [style.left.px]="izquierdaMenu()">
        @for (o of ocultas(); track o.clave) {
          <button type="button" role="menuitem" class="pildoras-opcion" [class.vacia]="!cuenta(o.clave)"
                  [style.--tono]="o.tono" (click)="elegir(o.clave)">
            <span><i class="bi" [class]="o.icono"></i> {{ o.texto }}</span>
            <span class="pildora-cuenta">{{ cuenta(o.clave) }}</span>
          </button>
        }
      </div>
    }

    <div #medida class="pildoras pildoras-medida" aria-hidden="true">
      @for (o of opciones(); track o.clave) {
        <span class="pildora">
          <i class="bi" [class]="o.icono"></i>
          {{ o.texto }}
          <span class="pildora-cuenta">{{ cuenta(o.clave) }}</span>
        </span>
      }
      <span class="pildora pildora-mas">
        Más <span class="pildora-cuenta">9</span> <i class="bi bi-chevron-down"></i>
      </span>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      flex: 1 1 0;
      min-width: 0;
    }
    .pildoras-medida {
      position: absolute;
      visibility: hidden;
      pointer-events: none;
      top: 0;
      left: 0;
      max-width: none;
    }

    .pildora-mas .bi-chevron-down { font-size: 0.7rem; transition: transform 0.2s ease; }
    .pildora-mas.abierto { background: #fff; color: var(--tinta); }
    .pildora-mas.abierto .bi-chevron-down { transform: rotate(180deg); }

    .pildoras-menu {
      position: absolute;
      top: calc(100% + 0.4rem);
      z-index: 20;
      min-width: 210px;
      padding: 0.35rem;
      background: #fff;
      border: 1px solid var(--linea);
      border-radius: 0.75rem;
      box-shadow: 0 12px 28px rgb(27 36 52 / 14%);
    }
    .pildoras-opcion {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.45rem 0.65rem;
      border: 0;
      border-radius: 0.5rem;
      background: transparent;
      color: var(--tinta);
      font-size: 0.85rem;
      font-weight: 600;
      text-align: left;
    }
    .pildoras-opcion .bi { color: var(--tono, var(--tinta-2)); margin-right: 0.35rem; }
    .pildoras-opcion:hover { background: #f1f4f8; }
    .pildoras-opcion.vacia { opacity: 0.55; }
  `,
})
export class Pildoras {
  readonly opciones = input.required<readonly OpcionPildora[]>();
  readonly activa = input.required<string>();
  readonly conteo = input<Record<string, number>>({});
  readonly cambio = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private readonly medida = viewChild.required<ElementRef<HTMLElement>>('medida');
  private readonly botonMas = viewChild<ElementRef<HTMLElement>>('botonMas');

  /** Claves que caben en el renglon, en su orden original. */
  private readonly caben = signal<string[] | null>(null);
  readonly menuAbierto = signal(false);
  readonly izquierdaMenu = signal(0);

  private readonly huella = computed(() =>
    JSON.stringify([this.activa(), this.conteo(), this.opciones().map((o) => o.clave)]),
  );

  readonly visibles = computed(() => {
    const caben = this.caben();
    return caben ? this.opciones().filter((o) => caben.includes(o.clave)) : this.opciones();
  });
  readonly ocultas = computed(() => {
    const caben = this.caben();
    return caben ? this.opciones().filter((o) => !caben.includes(o.clave)) : [];
  });

  constructor() {
    afterNextRender(() => {
      const observador = new ResizeObserver(() => this.medir());
      observador.observe(this.host.nativeElement);
      this.destroy.onDestroy(() => observador.disconnect());
      this.medir();
    });

    /*
     * Los numeros y la pestaña activa cambian el ancho: volver a medir. Se
     * compara por valor (huella) porque el padre puede mandar un objeto de
     * conteo nuevo en cada ciclo aunque los numeros sean los mismos.
     */
    effect(() => {
      this.huella();
      requestAnimationFrame(() => this.medir());
    });
  }

  cuenta(clave: string): number {
    return this.conteo()[clave] ?? 0;
  }

  elegir(clave: string) {
    this.menuAbierto.set(false);
    this.cambio.emit(clave);
  }

  alternarMenu() {
    const boton = this.botonMas()?.nativeElement;
    if (boton) this.izquierdaMenu.set(boton.offsetLeft);
    this.menuAbierto.update((a) => !a);
  }

  cerrarSiAfuera(e: Event) {
    if (!this.host.nativeElement.contains(e.target as Node)) this.menuAbierto.set(false);
  }

  /**
   * Toma las pestañas en orden mientras quepan, dejando lugar al boton "Más".
   * La activa se reserva primero: si quedaria en el menu, ocupa el lugar de
   * la ultima que cabia.
   */
  private medir() {
    const caja = this.medida().nativeElement;
    const piezas = Array.from(caja.children) as HTMLElement[];
    const opciones = this.opciones();
    if (piezas.length !== opciones.length + 1) return;

    const estilo = getComputedStyle(caja);
    const hueco = parseFloat(estilo.columnGap) || 0;
    const relleno = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight) + 2;
    const anchos = piezas.map((p) => p.getBoundingClientRect().width);
    const anchoMas = anchos.pop()!;
    const disponible = this.host.nativeElement.clientWidth - relleno;

    const total = anchos.reduce((s, a) => s + a, 0) + hueco * (anchos.length - 1);
    if (total <= disponible) {
      this.fijar(null);
      return;
    }

    const iActiva = opciones.findIndex((o) => o.clave === this.activa());
    let usado = anchoMas + (iActiva >= 0 ? anchos[iActiva] + hueco : 0);
    const elegidas = new Set<number>(iActiva >= 0 ? [iActiva] : []);
    for (let i = 0; i < opciones.length; i++) {
      if (i === iActiva) continue;
      if (usado + anchos[i] + hueco > disponible) break;
      usado += anchos[i] + hueco;
      elegidas.add(i);
    }
    this.fijar(opciones.filter((_, i) => elegidas.has(i)).map((o) => o.clave));
  }

  /** Solo escribe si cambio: medir no debe provocar otro ciclo de render por nada. */
  private fijar(caben: string[] | null) {
    if (JSON.stringify(caben) !== JSON.stringify(this.caben())) this.caben.set(caben);
  }
}
