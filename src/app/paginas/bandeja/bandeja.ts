import { Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { cronometro, duracion, mensajeError, ubicacionActual } from '../../core/formato';
import type { Catalogos, Ticket, TicketDetalle } from '../../core/modelos';

@Component({
  selector: 'app-bandeja',
  imports: [TablaTickets, DetalleTicket],
  templateUrl: './bandeja.html',
})
export class Bandeja implements OnDestroy {
  private readonly api = inject(TicketsService);
  readonly auth = inject(AuthService);

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly abierto = signal<number | null>(null);
  readonly error = signal('');

  /** Ticket con reloj corriendo, si lo hay. Solo puede haber uno (§16). */
  readonly enCurso = signal<TicketDetalle | null>(null);
  /** Segundos acumulados en sitio del ticket en curso; avanza cada segundo. */
  readonly segundos = signal(0);

  readonly permisoGeo = signal<PermissionState | 'desconocido'>('desconocido');

  private readonly latido = setInterval(() => {
    if (this.enCurso()) this.segundos.update((s) => s + 1);
  }, 1000);

  readonly crono = cronometro;
  readonly dur = duracion;

  readonly abiertos = computed(() =>
    this.tickets().filter((t) => !['CERRADO', 'CANCELADO'].includes(t.estatus)),
  );
  readonly cerrados = computed(() =>
    this.tickets().filter((t) => ['CERRADO', 'CANCELADO'].includes(t.estatus)),
  );
  readonly vencidos = computed(() => this.abiertos().filter((t) => t.vencido).length);
  readonly enEspera = computed(
    () => this.abiertos().filter((t) => t.estatus === 'EN_ESPERA').length,
  );

  /** Candidato para arrancar el reloj cuando no hay ninguno activo. */
  readonly siguiente = computed(
    () => this.abiertos().find((t) => ['ASIGNADO', 'EN_ATENCION'].includes(t.estatus)) ?? null,
  );

  constructor() {
    this.api.catalogos().subscribe({ next: (c) => this.catalogos.set(c) });
    void this.revisaPermisoGeo();
    this.cargar();
  }

  ngOnDestroy() {
    clearInterval(this.latido);
  }

  cargar() {
    this.api.listar().subscribe({
      next: (t) => {
        this.tickets.set(t);
        this.buscaRelojActivo(t);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /**
   * El listado no trae las sesiones abiertas, solo cuántas hay. Para el panel
   * superior se pide el detalle del único candidato posible: el ticket propio
   * en atención con sesiones registradas.
   */
  private buscaRelojActivo(lista: Ticket[]) {
    const mio = this.auth.usuario()?.id;
    const candidato = lista.find(
      (t) => t.tecnico_id === mio && t.estatus === 'EN_ATENCION' && t.sesiones > 0,
    );
    if (!candidato) {
      this.enCurso.set(null);
      this.segundos.set(0);
      return;
    }
    this.api.detalle(candidato.id).subscribe({
      next: (d) => {
        const activa = d.sesiones.some((s) => !s.fin);
        this.enCurso.set(activa ? d : null);
        this.segundos.set(activa ? d.sesiones.reduce((a, s) => a + s.segundos, 0) : 0);
      },
    });
  }

  private async revisaPermisoGeo() {
    try {
      if (!navigator.permissions) return;
      const st = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      this.permisoGeo.set(st.state);
    } catch {
      this.permisoGeo.set('desconocido');
    }
  }

  /** Dispara el aviso del navegador para que el técnico conceda la ubicación. */
  async pedirPermisoGeo() {
    const g = await ubicacionActual();
    this.permisoGeo.set(g.motivo_sin_ubicacion ? 'denied' : 'granted');
  }

  async iniciarReloj(id: number) {
    const geo = await ubicacionActual();
    this.api.relojInicio(id, geo).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
