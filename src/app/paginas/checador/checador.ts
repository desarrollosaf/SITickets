import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { mensajeError, ubicacionActual } from '../../core/formato';
import type { Catalogos } from '../../core/modelos';

/**
 * §16 · Destino del QR "de llegada" que se muestra en el detalle del ticket.
 * El técnico lo escanea al llegar a atender: si no tiene sesión, el guard de
 * la ruta lo manda a /entrar y de ahí regresa aquí mismo (ver `volver` en
 * guards.ts y login.ts). Ya con sesión, arranca el reloj sin que tenga que
 * navegar menú → turnados → ticket → botón.
 */
@Component({
  selector: 'app-checador',
  imports: [DetalleTicket],
  templateUrl: './checador.html',
})
export class Checador {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(TicketsService);

  readonly ticketId = Number(this.route.snapshot.paramMap.get('id'));
  readonly catalogos = signal<Catalogos | null>(null);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly abierto = signal<number | null>(null);

  constructor() {
    this.api.catalogos().subscribe({ next: (c) => this.catalogos.set(c) });
    void this.registrarLlegada();
  }

  private async registrarLlegada() {
    /* La ubicacion nunca detiene el reloj: si no llega, se guarda el motivo. */
    const geo = await ubicacionActual();
    this.api.relojInicio(this.ticketId, geo).subscribe({
      next: () => {
        this.cargando.set(false);
        this.abierto.set(this.ticketId);
      },
      error: (e) => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  reintentar() {
    this.cargando.set(true);
    this.error.set('');
    void this.registrarLlegada();
  }

  /** Al cerrar el detalle ya no tiene caso quedarse en esta pantalla de paso. */
  irAInicio() {
    const rol = this.auth.rol();
    void this.router.navigate([rol ? this.auth.inicioDeRol(rol) : '/entrar']);
  }
}
