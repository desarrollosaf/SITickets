import { Component, computed, inject, signal } from '@angular/core';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, NOMBRE_PRIORIDAD } from '../../core/formato';
import type { Catalogos, Problema } from '../../core/modelos';

interface Grupo {
  servicio: string;
  origen: string;
  problemas: Problema[];
}

/** §2 · Es lo que ve el usuario en el segundo select. Administrable sin tocar código. */
@Component({
  selector: 'app-catalogo',
  template: `
    <h1 class="h5 mb-1">Catálogo de problemas</h1>
    <p class="sub mb-3">
      Sustituye al campo de texto libre. Cada opción trae su prioridad y el dato de contexto que se
      pide al elegirla.
    </p>

    @if (error()) {
      <div class="alert alert-danger py-2 small">{{ error() }}</div>
    }

    @for (g of grupos(); track g.servicio) {
      <div class="tarjeta mb-3 overflow-hidden">
        <div class="p-3 border-bottom">
          <h2 class="h6 mb-0">
            {{ g.servicio }}
            <span class="sub fw-normal">
              · {{ g.problemas.length }} opciones · origen {{ g.origen }}
            </span>
          </h2>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead class="table-light">
              <tr class="sub">
                <th style="width: 100px">Clave</th>
                <th>Opción</th>
                <th style="width: 130px">Prioridad</th>
                <th style="width: 220px">Campo adicional</th>
              </tr>
            </thead>
            <tbody>
              @for (p of g.problemas; track p.id) {
                <tr>
                  <td class="mono sub">{{ p.clave }}</td>
                  <td>
                    {{ p.descripcion }}
                    @if (p.requiere_texto) {
                      <span class="chip chip-bandera ms-1">habilita texto libre</span>
                    }
                  </td>
                  <td>
                    <span class="chip" [class]="'chip-' + p.prioridad">{{ p.prioridad }}</span>
                    <span class="sub ms-1">{{ nombrePrioridad[p.prioridad] }}</span>
                  </td>
                  <td class="sub">{{ p.campo_adicional || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class Catalogo {
  private readonly api = inject(TicketsService);

  readonly catalogos = signal<Catalogos | null>(null);
  readonly error = signal('');
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;

  readonly grupos = computed<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const p of this.catalogos()?.problemas ?? []) {
      if (!mapa.has(p.servicio)) {
        mapa.set(p.servicio, {
          servicio: p.servicio,
          origen: p.origen === 'usuario' ? 'usuario' : 'administrador',
          problemas: [],
        });
      }
      mapa.get(p.servicio)!.problemas.push(p);
    }
    return [...mapa.values()];
  });

  constructor() {
    this.api.catalogos().subscribe({
      next: (c) => this.catalogos.set(c),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
