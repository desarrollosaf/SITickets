import { Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { banderas, duracion, etiquetaEstatus } from '../core/formato';
import type { Ticket } from '../core/modelos';

@Component({
  selector: 'app-tabla-tickets',
  template: `
    @if (!tickets().length) {
      <div class="tarjeta p-5 text-center">
        <i class="bi bi-inbox fs-2 sub d-block mb-2"></i>
        <div class="fw-semibold">{{ vacio() }}</div>
        <div class="sub">{{ ayudaVacio() }}</div>
      </div>
    } @else {
      <div class="tarjeta overflow-hidden">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0 tickets">
            <thead class="table-light">
              <tr class="sub">
                <th style="width: 140px">Folio</th>
                <th>Asunto</th>
                <th style="width: 130px">Servicio</th>
                @if (!esSolicitante()) {
                  <th style="width: 60px">Prio</th>
                }
                <th style="width: 140px">Estatus</th>
                @if (!sinTecnico()) {
                  <th style="width: 150px">Técnico</th>
                }
                <th style="width: 110px">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              @for (t of tickets(); track t.id) {
                <tr (click)="abrir.emit(t.id)"
                    [class.por-confirmar]="pedirConfirmacion() && t.estatus === 'RESUELTO'">
                  <td>
                    <span class="folio">{{ t.folio }}</span>
                    @if (t.reclasificado) {
                      <div class="sub" style="font-size: 0.7rem">prefijo original</div>
                    }
                  </td>
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
                    @if (pedirConfirmacion() && t.estatus === 'RESUELTO') {
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
                  @if (!esSolicitante()) {
                    <td><span class="chip" [class]="'chip-' + t.prioridad">{{ t.prioridad }}</span></td>
                  }
                  <td>
                    <span class="estatus" [class]="estatus(t).clase">{{ estatus(t).texto }}</span>
                  </td>
                  @if (!sinTecnico()) {
                    <td class="sub">{{ t.tecnico || 'Por definir' }}</td>
                  }
                  <td class="sub">
                    <span [class.vencido]="t.vencido">{{ dur(t.min_activo) }}</span>
                    <div class="sub" style="font-size: 0.7rem">meta {{ dur(t.minutos_objetivo) }}</div>
                  </td>
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
  /** Solo tiene sentido en "Mis tickets": el solicitante debe confirmar o rechazar. */
  readonly pedirConfirmacion = input(false);

  readonly abrir = output<number>();

  readonly dur = duracion;
  readonly marcas = banderas;

  /** Oculta Prio y la mecanica interna de "EN COLA": no le compete al solicitante. */
  readonly esSolicitante = computed(() => this.auth.rol() === 'solicitante');

  estatus(t: Ticket) {
    return etiquetaEstatus(t, this.esSolicitante());
  }
}
