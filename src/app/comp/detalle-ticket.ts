import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { TicketsService } from '../core/tickets.service';
import {
  banderas,
  cronometro,
  duracion,
  etiquetaEstatus,
  fecha,
  mensajeError,
  NOMBRE_PRIORIDAD,
  resumenUbicacion,
  ubicacionActual,
} from '../core/formato';
import type { Catalogos, Tecnico, TicketDetalle } from '../core/modelos';

/** Formularios que puede desplegar el cajon. */
type Formulario =
  | null
  | 'espera'
  | 'resolver'
  | 'cancelar'
  | 'rechazar'
  | 'reabrir'
  | 'reasignar'
  | 'reclasificar'
  | 'prioridad'
  | 'reloj-fin';

const MOTIVOS_ESPERA = [
  'Refacción no disponible en almacén',
  'En espera de visita del proveedor',
  'Usuario ausente o sin acceso al área',
  'En espera de autorización',
];

@Component({
  selector: 'app-detalle-ticket',
  imports: [FormsModule],
  templateUrl: './detalle-ticket.html',
})
export class DetalleTicket {
  private readonly api = inject(TicketsService);
  private readonly auth = inject(AuthService);

  /** Id del ticket abierto. null cierra el cajon. */
  readonly ticketId = input.required<number | null>();
  readonly catalogos = input<Catalogos | null>(null);
  readonly tecnicos = input<Tecnico[]>([]);

  readonly cerrar = output<void>();
  /** Se emite tras cualquier movimiento para que la lista de atras se refresque. */
  readonly cambio = output<void>();

  readonly ticket = signal<TicketDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly formulario = signal<Formulario>(null);
  readonly ocupado = signal(false);

  readonly motivosEspera = MOTIVOS_ESPERA;
  readonly dur = duracion;
  readonly crono = cronometro;
  readonly fmt = fecha;
  readonly marcas = banderas;
  readonly estatus = etiquetaEstatus;
  readonly geo = resumenUbicacion;
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;

  /* --- campos de los formularios --- */
  motivo = '';
  diagnostico = '';
  solucion = '';
  refacciones = '';
  nota = '';
  tecnicoDestino: number | null = null;
  problemaDestino = '';
  prioridadDestino = '';
  dejarEnEspera = true;

  constructor() {
    effect(() => {
      const id = this.ticketId();
      if (id === null) {
        this.ticket.set(null);
        return;
      }
      this.recargar(id);
    });
  }

  /* ==================================================================
     Permisos de pantalla. Duplican los del backend a proposito: aqui
     sirven para no ofrecer botones que fallarian; la decision real la
     toma NestJS en cada peticion.
     ================================================================== */

  readonly rol = this.auth.rol;
  readonly esMio = computed(() => this.ticket()?.tecnico_id === this.auth.usuario()?.id);
  readonly esMiSolicitud = computed(
    () => this.ticket()?.solicitante_id === this.auth.usuario()?.id,
  );
  readonly atiende = computed(() => ['tecnico', 'jefe', 'proveedor'].includes(this.rol() ?? ''));
  readonly esAdmin = computed(() => this.rol() === 'admin');
  readonly abierto = computed(
    () => !['CERRADO', 'CANCELADO'].includes(this.ticket()?.estatus ?? ''),
  );
  readonly relojCorriendo = computed(() => this.ticket()?.sesiones.some((s) => !s.fin) ?? false);

  /** Avance contra el objetivo de resolucion, tope 100 %. */
  readonly avance = computed(() => {
    const t = this.ticket();
    if (!t) return 0;
    return Math.min(100, Math.round((t.min_activo / t.minutos_objetivo) * 100));
  });

  readonly segundosEnSitio = computed(() =>
    (this.ticket()?.sesiones ?? []).reduce((a, s) => a + s.segundos, 0),
  );

  /** Opciones de reclasificacion: servicios de usuario distintos al actual. */
  readonly problemasReclasificacion = computed(() => {
    const t = this.ticket();
    const c = this.catalogos();
    if (!t || !c) return [];
    return c.problemas.filter((p) => p.origen === 'usuario' && p.servicio_id !== t.servicio_id);
  });

  /* ================================================================== */

  private recargar(id: number) {
    this.cargando.set(true);
    this.error.set('');
    this.api.detalle(id).subscribe({
      next: (t) => {
        this.ticket.set(t);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  abrirFormulario(f: Formulario) {
    this.motivo = '';
    this.diagnostico = '';
    this.solucion = '';
    this.refacciones = '';
    this.nota = '';
    this.tecnicoDestino = null;
    this.problemaDestino = '';
    this.prioridadDestino = this.ticket()?.prioridad ?? '';
    this.dejarEnEspera = true;
    this.error.set('');
    this.formulario.set(f);
  }

  /** Aplica la respuesta del backend y avisa a la pantalla de atras. */
  private aplicar(t: TicketDetalle) {
    this.ticket.set(t);
    this.formulario.set(null);
    this.ocupado.set(false);
    this.cambio.emit();
  }

  private falla(e: unknown) {
    this.ocupado.set(false);
    this.error.set(mensajeError(e));
  }

  private id(): number {
    return this.ticket()!.id;
  }

  /* ---------------- acciones directas ---------------- */

  iniciar() {
    this.ocupado.set(true);
    this.api.iniciar(this.id()).subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  reanudar() {
    this.ocupado.set(true);
    this.api.reanudar(this.id()).subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  validar() {
    this.ocupado.set(true);
    this.api.validar(this.id()).subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  /* ---------------- §16 reloj checador ---------------- */

  async iniciarReloj() {
    this.ocupado.set(true);
    /* La ubicacion nunca detiene el reloj: si no llega, se guarda el motivo. */
    const geo = await ubicacionActual();
    this.api.relojInicio(this.id(), geo).subscribe({
      next: (t) => this.aplicar(t),
      error: (e) => this.falla(e),
    });
  }

  async detenerReloj() {
    this.ocupado.set(true);
    const geo = await ubicacionActual();
    this.api
      .relojFin(this.id(), { ...geo, motivo: this.nota || undefined, en_espera: this.dejarEnEspera })
      .subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  /* ---------------- formularios ---------------- */

  enviarEspera() {
    this.ocupado.set(true);
    this.api.espera(this.id(), this.motivo).subscribe({
      next: (t) => this.aplicar(t),
      error: (e) => this.falla(e),
    });
  }

  enviarResolver() {
    this.ocupado.set(true);
    this.api
      .resolver(this.id(), {
        diagnostico: this.diagnostico,
        solucion: this.solucion,
        refacciones: this.refacciones || undefined,
      })
      .subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  enviarCancelar() {
    this.ocupado.set(true);
    this.api.cancelar(this.id(), this.motivo).subscribe({
      next: (t) => this.aplicar(t),
      error: (e) => this.falla(e),
    });
  }

  enviarRechazar() {
    this.ocupado.set(true);
    this.api.rechazar(this.id(), this.motivo).subscribe({
      next: (t) => this.aplicar(t),
      error: (e) => this.falla(e),
    });
  }

  enviarReabrir() {
    this.ocupado.set(true);
    this.api.reabrir(this.id(), this.motivo).subscribe({
      next: (t) => this.aplicar(t),
      error: (e) => this.falla(e),
    });
  }

  enviarReasignar() {
    if (!this.tecnicoDestino) {
      this.error.set('Elige el técnico destino.');
      return;
    }
    this.ocupado.set(true);
    this.api
      .reasignar(this.id(), {
        tecnico: Number(this.tecnicoDestino),
        motivo: this.motivo,
        nota: this.nota || undefined,
      })
      .subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  enviarReclasificar() {
    this.ocupado.set(true);
    this.api
      .reclasificar(this.id(), { problema: this.problemaDestino, motivo: this.motivo })
      .subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  enviarPrioridad() {
    this.ocupado.set(true);
    this.api
      .prioridad(this.id(), { prioridad: this.prioridadDestino, motivo: this.motivo })
      .subscribe({ next: (t) => this.aplicar(t), error: (e) => this.falla(e) });
  }

  imprimir() {
    window.print();
  }
}
