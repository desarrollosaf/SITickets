import { Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { banderas, duracion, etiquetaEstatus } from '../core/formato';
import type { Ticket } from '../core/modelos';

const ACENTO: Record<string, string> = {
  'estatus-REGISTRADO': '#45566b',
  'estatus-ASIGNADO': '#2b6cb0',
  'estatus-EN_ATENCION': '#0f8a8a',
  'estatus-RESUELTO': '#6d35c9',
  'estatus-CERRADO': '#1f8a56',
  'estatus-EN_ESPERA': 'var(--p2)',
  'estatus-EN_COLA': 'var(--p1)',
  'estatus-CANCELADO': '#77808c',
};

@Component({
  selector: 'app-tabla-tickets',
  template: `
    @if (!tickets().length) {
      <div class="tarjeta p-5 text-center">
        <i class="bi bi-inbox fs-2 sub d-block mb-2"></i>
        <div class="fw-semibold">{{ vacio() }}</div>
        <div class="sub">{{ ayudaVacio() }}</div>
      </div>
    } @else if (boletos()) {
      <div class="boletos">
        @for (t of tickets(); track t.id) {
          <div class="boleto" role="button" tabindex="0"
               [style.--acento]="acento(t)"
               [class.por-confirmar]="t.estatus === 'RESUELTO' && pedirConfirmacion()(t)"
               (click)="abrir.emit(t.id)" (keydown.enter)="abrir.emit(t.id)">
            <div class="boleto-fila">
            <div class="boleto-cuerpo">
              <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                <span class="folio boleto-folio">
                  <i class="bi bi-ticket-perforated"></i>
                  @if (esAdminUOperador() && t.datos_copiados) {
                    <span class="punto-copiado" title="Datos copiados"></span>
                  }
                  {{ esSolicitante() ? t.folio_general : t.folio }}
                  @if (muestraFolioGeneral() && t.folio_general !== t.folio) {
                    <span class="sub ms-1">· general {{ t.folio_general }}</span>
                  }
                </span>
                <span class="d-flex gap-1 align-items-center">
                  @if (!esSolicitante() && !ocultaPrioTiempo()) {
                    <span class="chip" [class]="'chip-' + t.prioridad">{{ t.prioridad }}</span>
                  }
                  <span class="estatus" [class]="estatus(t).clase">{{ estatus(t).texto }}</span>
                </span>
              </div>

              <div class="boleto-columnas">
                <div>
                  <div class="boleto-asunto">{{ t.problema }}</div>
                  <div class="boleto-datos">
                    <span class="boleto-dato"><i class="bi bi-tools"></i> {{ t.servicio }}</span>
                    @if (t.edificio_atencion) {
                      <span class="boleto-dato"><i class="bi bi-geo-alt"></i> {{ t.edificio_atencion }}</span>
                    }
                  </div>
                </div>
                @if (!esSolicitante()) {
                  <div class="boleto-col-quien">
                    <div class="boleto-dato">
                      <i class="bi bi-person"></i>
                      @if (t.interno) {
                        {{ t.contexto || 'Trabajo interno del área' }}
                      } @else {
                        <b>{{ t.solicitante }}</b>
                        <div class="boleto-dependencia">{{ t.dependencia }}</div>
                      }
                    </div>
                    @if (t.registrado_por_nombre) {
                      <div class="boleto-dato">
                        <i class="bi bi-pencil-square"></i> Registrado por {{ t.registrado_por_nombre }}
                      </div>
                    }
                  </div>
                }
              </div>

              @if (marcas(t).length) {
                <div class="d-flex flex-wrap gap-1 mt-2">
                  @for (b of marcas(t); track b.texto) {
                    <span class="chip" [class]="b.clase">{{ b.texto }}</span>
                  }
                </div>
              }
            </div>

            <div class="boleto-talon">
              @if (!sinTecnico()) {
                <div class="boleto-celda">
                  <span>Técnico</span>
                  <b>{{ t.tecnico || 'Por definir' }}</b>
                </div>
              }
              @if (!ocultaPrioTiempo()) {
                <div class="boleto-celda boleto-celda-fin">
                  <span>Tiempo · meta {{ dur(t.minutos_objetivo) }}</span>
                  <b [class.vencido]="t.vencido">{{ dur(t.min_activo) }}</b>
                </div>
              }
            </div>
            </div>

            @if (t.estatus === 'RESUELTO' && pedirConfirmacion()(t)) {
              <div class="boleto-confirmar">
                <span><i class="bi bi-patch-question"></i> ¿Sí quedó resuelto? Confírmalo aquí</span>
                <i class="bi bi-chevron-right"></i>
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <div class="tarjeta overflow-hidden">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0 tickets">
            <thead class="table-light">
              <tr class="sub">
                <th style="width: 140px">Folio</th>
                @if (muestraFolioGeneral()) {
                  <th style="width: 140px">Folio general</th>
                }
                <th>Asunto</th>
                <th style="width: 130px">Servicio</th>
                @if (!esSolicitante() && !ocultaPrioTiempo()) {
                  <th style="width: 60px" [class.ordenable]="ordenable()" (click)="ordenable() && ordenar.emit('prioridad')">
                    Prio
                    @if (ordenable()) {
                      <i class="bi" [class.bi-caret-up-fill]="ordenPor() === 'prioridad' && ordenDir() === 'asc'"
                         [class.bi-caret-down-fill]="ordenPor() !== 'prioridad' || ordenDir() === 'desc'"
                         [class.activo]="ordenPor() === 'prioridad'"></i>
                    }
                  </th>
                }
                <th style="width: 140px">Estatus</th>
                @if (!sinTecnico()) {
                  <th style="width: 150px">Técnico</th>
                }
                @if (!ocultaPrioTiempo()) {
                  <th style="width: 110px" [class.ordenable]="ordenable()" (click)="ordenable() && ordenar.emit('tiempo')">
                    Tiempo
                    @if (ordenable()) {
                      <i class="bi" [class.bi-caret-up-fill]="ordenPor() === 'tiempo' && ordenDir() === 'asc'"
                         [class.bi-caret-down-fill]="ordenPor() !== 'tiempo' || ordenDir() === 'desc'"
                         [class.activo]="ordenPor() === 'tiempo'"></i>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (t of tickets(); track t.id) {
                <tr (click)="abrir.emit(t.id)"
                    [class.por-confirmar]="t.estatus === 'RESUELTO' && pedirConfirmacion()(t)">
                  <td>
                    @if (esAdminUOperador() && t.datos_copiados) {
                      <span class="punto-copiado" title="Datos copiados"></span>
                    }
                    <span class="folio">{{ esSolicitante() ? t.folio_general : t.folio }}</span>
                    @if (t.reclasificado) {
                      <div class="sub" style="font-size: 0.7rem">prefijo original</div>
                    }
                  </td>
                  @if (muestraFolioGeneral()) {
                    <td class="sub">{{ t.folio_general }}</td>
                  }
                  <td>
                    <div class="fw-semibold" style="font-size: 0.86rem">{{ t.problema }}</div>
                    <div class="sub text-truncate" style="max-width: 340px">
                      {{ t.interno ? (t.contexto || 'Trabajo interno del área') : t.solicitante + ' · ' + t.dependencia }}
                    </div>
                    @if (t.registrado_por_nombre) {
                      <div class="sub text-truncate" style="max-width: 340px; font-size: 0.72rem">
                        Registrado por {{ t.registrado_por_nombre }}
                      </div>
                    }
                    @if (t.edificio_atencion) {
                      <div class="sub text-truncate" style="max-width: 340px; font-size: 0.72rem">
                        <i class="bi bi-geo-alt"></i> {{ t.edificio_atencion }}
                      </div>
                    }
                    @if (t.estatus === 'RESUELTO' && pedirConfirmacion()(t)) {
                      <div class="d-flex flex-wrap gap-1 mt-1">
                        <span class="chip chip-confirmar">
                          <i class="bi bi-question-circle"></i> ¿Sí quedó resuelto? Da clic para confirmar
                        </span>
                      </div>
                    }
                    @if (marcas(t).length) {
                      <div class="d-flex flex-wrap gap-1 mt-1">
                        @for (b of marcas(t); track b.texto) {
                          <span class="chip" [class]="b.clase">{{ b.texto }}</span>
                        }
                      </div>
                    }
                  </td>
                  <td class="sub">{{ t.servicio }}</td>
                  @if (!esSolicitante() && !ocultaPrioTiempo()) {
                    <td><span class="chip" [class]="'chip-' + t.prioridad">{{ t.prioridad }}</span></td>
                  }
                  <td>
                    <span class="estatus" [class]="estatus(t).clase">{{ estatus(t).texto }}</span>
                  </td>
                  @if (!sinTecnico()) {
                    <td class="sub">{{ t.tecnico || 'Por definir' }}</td>
                  }
                  @if (!ocultaPrioTiempo()) {
                    <td class="sub">
                      <span [class.vencido]="t.vencido">{{ dur(t.min_activo) }}</span>
                      <div class="sub" style="font-size: 0.7rem">meta {{ dur(t.minutos_objetivo) }}</div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class TablaTickets {
  private readonly auth = inject(AuthService);

  readonly tickets = input.required<Ticket[]>();
  readonly sinTecnico = input(false);
  readonly vacio = input('Sin tickets');
  readonly ayudaVacio = input('Ajusta los filtros o registra uno nuevo.');
  /**
   * Por renglon, no un booleano global: decide si a ESTE visitante le toca
   * confirmar/rechazar ESTE ticket en particular (en "Mis tickets" siempre
   * es true; en "Tickets generados" solo el gestor que lo registro, o el
   * caso especial de cierre por servicio — ver tickets.ts).
   */
  readonly pedirConfirmacion = input<(t: Ticket) => boolean>(() => false);
  /** Tarjetas tipo talon en vez de tabla: para listas cortas, como "Mis tickets". */
  readonly boletos = input(false);

  /** Encabezados clicables de Prio/Tiempo; el padre decide el orden real (ver tickets.ts). */
  readonly ordenable = input(false);
  readonly ordenPor = input<'prioridad' | 'tiempo' | null>(null);
  readonly ordenDir = input<'asc' | 'desc'>('desc');

  readonly abrir = output<number>();
  readonly ordenar = output<'prioridad' | 'tiempo'>();

  readonly dur = duracion;
  readonly marcas = banderas;

  /** Oculta Prio y la mecanica interna de "EN COLA": no le compete al solicitante. */
  readonly esSolicitante = computed(() => this.auth.rol() === 'solicitante');
  /** Admin/operador ven ademas el folio general (TK/DI/N), aparte del folio vigente. */
  readonly esAdminUOperador = computed(() =>
    ['admin', 'operador'].includes(this.auth.rol() ?? ''),
  );
  /** Gestor/validador no gestionan la operacion tecnica: Prio y Tiempo no les sirven. */
  readonly ocultaPrioTiempo = computed(() =>
    ['gestor', 'validador'].includes(this.auth.rol() ?? ''),
  );
  /** Admin/operador/gestor/validador ven ademas el folio general (TK/DI/N), aparte del vigente. */
  readonly muestraFolioGeneral = computed(() =>
    ['admin', 'operador', 'gestor', 'validador'].includes(this.auth.rol() ?? ''),
  );

  estatus(t: Ticket) {
    return etiquetaEstatus(t, this.esSolicitante());
  }

  /** Color de la franja del boleto: el mismo del chip de estatus (styles.scss). */
  acento(t: Ticket): string {
    return ACENTO[this.estatus(t).clase] ?? 'var(--p4)';
  }
}
