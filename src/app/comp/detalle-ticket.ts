import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { TicketsService } from '../core/tickets.service';
import {
  banderas,
  cronometro,
  duracion,
  esCampoInventario,
  etiquetaEstatus,
  fecha,
  mensajeError,
  NOMBRE_PRIORIDAD,
  resumenUbicacion,
  ubicacionActual,
} from '../core/formato';
import type { Bien, BienTicket, Catalogos, Tecnico, TicketDetalle } from '../core/modelos';

/** Formularios que puede desplegar el cajon. */
type Formulario =
  | null
  | 'datos'
  | 'espera'
  | 'resolver'
  | 'atender-cmp'
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
  'Retirar el equipo del lugar para su revisión',
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
  /** Equipo de computo elegido por el solicitante. Solo se pide para servicio CMP. */
  readonly bienTicket = signal<BienTicket | null>(null);
  readonly formulario = signal<Formulario>(null);
  readonly ocupado = signal(false);
  /** Aviso si SIASAF no respondio al avisar la asignacion temporal del equipo. */
  readonly avisoCustodia = signal<string | null>(null);

  readonly motivosEspera = MOTIVOS_ESPERA;
  readonly dur = duracion;
  readonly crono = cronometro;
  readonly fmt = fecha;
  readonly marcas = banderas;
  readonly geo = resumenUbicacion;
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;

  /* --- correccion de datos generales --- */
  readonly dContexto = signal('');
  readonly dExtension = signal('');

  /* --- correccion del numero de inventario: mismo mecanismo que al registrar --- */
  readonly esInventarioTicket = computed(() => esCampoInventario(this.ticket()?.campo_adicional));
  readonly dBienes = signal<Bien[]>([]);
  readonly dCargandoBienes = signal(false);
  /** Explica por que no hay lista; con eso se ofrece captura manual. */
  readonly dMotivoBienes = signal('');
  /** Inventarios elegidos al corregir. Con la lista disponible, esto es lo que se manda. */
  readonly dSeleccion = signal<string[]>([]);
  readonly dContextoFinal = computed(() =>
    this.esInventarioTicket() && this.dBienes().length
      ? this.dSeleccion().join(', ')
      : this.dContexto().trim(),
  );

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
  resultadoCmp: 'reparado' | 'baja' = 'reparado';
  observacionesBaja = '';
  fotosBaja: File[] = [];
  readonly mejorandoRedaccion = signal(false);

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
  /** Oculta la mecanica interna de "EN COLA": al solicitante solo le importa que quedo registrado. */
  readonly esSolicitante = computed(() => this.rol() === 'solicitante');
  /** El operador tambien puede reasignar tecnico, aunque no es admin. */
  readonly puedeReasignar = computed(() => this.esAdmin() || this.rol() === 'operador');

  estatus(t: TicketDetalle) {
    return etiquetaEstatus(t, this.esSolicitante());
  }
  readonly abierto = computed(
    () => !['CERRADO', 'CANCELADO'].includes(this.ticket()?.estatus ?? ''),
  );
  readonly relojCorriendo = computed(() => this.ticket()?.sesiones.some((s) => !s.fin) ?? false);
  /** Equipo de computo: "Atender ticket" reemplaza a "Marcar resuelto". */
  readonly esCmpTicket = computed(() => this.ticket()?.servicio_clave === 'CMP');

  /** Avance contra el objetivo de resolucion, tope 100 %. */
  readonly avance = computed(() => {
    const t = this.ticket();
    if (!t) return 0;
    return Math.min(100, Math.round((t.min_activo / t.minutos_objetivo) * 100));
  });

  readonly segundosEnSitio = computed(() =>
    (this.ticket()?.sesiones ?? []).reduce((a, s) => a + s.segundos, 0),
  );

  /**
   * Quien puede corregir los datos generales: quien levanto el reporte y el
   * administrador. El boton solo se habilita, ademas, mientras el tecnico
   * tiene el ticket EN ESPERA (ver enEspera) — asi no se pisa un cambio de
   * bien mientras se atiende activamente. El backend vuelve a revisar todo
   * esto; aqui solo se decide que se ofrece.
   */
  readonly puedeCorregir = computed(() => this.esMiSolicitud() || this.esAdmin());
  readonly enEspera = computed(() => this.ticket()?.estatus === 'EN_ESPERA');

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
    this.bienTicket.set(null);
    this.api.detalle(id).subscribe({
      next: (t) => {
        this.ticket.set(t);
        this.cargando.set(false);
        if (t.servicio_clave === 'CMP') {
          this.api.bienDelTicket(id).subscribe({ next: (b) => this.bienTicket.set(b) });
        }
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
    this.resultadoCmp = 'reparado';
    this.observacionesBaja = '';
    this.fotosBaja = [];
    this.error.set('');
    this.avisoCustodia.set(null);
    this.formulario.set(f);
  }

  /** Abre la correccion con los valores que hoy tiene el ticket. */
  abrirDatos() {
    const t = this.ticket();
    if (!t) return;
    this.dContexto.set(t.contexto ?? '');
    this.dSeleccion.set(t.contexto ? t.contexto.split(',').map((s) => s.trim()).filter(Boolean) : []);
    this.dExtension.set(t.extension ?? '');
    this.error.set('');
    this.formulario.set('datos');
    this.dBienes.set([]);
    this.dMotivoBienes.set('');

    /* Igual que al registrar: si el campo pide inventario, se elige de una lista. */
    if (this.esInventarioTicket()) {
      this.dCargandoBienes.set(true);
      this.api.bienesParaCorregir(t.id).subscribe({
        next: (r) => {
          this.dCargandoBienes.set(false);
          this.dBienes.set(r.bienes);
          this.dMotivoBienes.set(r.bienes.length ? '' : (r.motivo ?? 'No tiene bienes resguardados.'));
        },
        error: (e) => {
          this.dCargandoBienes.set(false);
          this.dBienes.set([]);
          this.dMotivoBienes.set(mensajeError(e));
        },
      });
    }
  }

  /** Equipo de computo: un solo equipo por ticket. */
  dElegirBienUnico(inventario: string) {
    this.dSeleccion.set([inventario]);
  }

  /** Resto de servicios con inventario: un reporte puede abarcar varios bienes. */
  dAlternaBien(inventario: string) {
    const actual = this.dSeleccion();
    this.dSeleccion.set(
      actual.includes(inventario) ? actual.filter((i) => i !== inventario) : [...actual, inventario],
    );
  }

  enviarDatos() {
    const t = this.ticket();
    if (!t) return;
    this.ocupado.set(true);
    this.api
      .datos(t.id, { contexto: this.dContextoFinal(), extension: this.dExtension().trim() })
      .subscribe({ next: (r) => this.aplicar(r), error: (e) => this.falla(e) });
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

  /* ---------------- Equipo de computo (CMP) ---------------- */

  /** Fotos evidencia para el anexo fotografico del dictamen; se acumulan entre selecciones. */
  onFotosSeleccionadas(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fotosBaja = [...this.fotosBaja, ...Array.from(input.files ?? [])];
    input.value = '';
  }

  quitarFotoBaja(i: number) {
    this.fotosBaja = this.fotosBaja.filter((_, idx) => idx !== i);
  }

  /** Reescribe con IA lo que el técnico ya escribió; el resultado sigue siendo editable. */
  mejorarRedaccion() {
    const texto = this.observacionesBaja.trim();
    if (texto.length < 10 || this.mejorandoRedaccion()) return;
    this.mejorandoRedaccion.set(true);
    this.error.set('');
    this.api.mejorarObservaciones(texto).subscribe({
      next: (r) => {
        this.observacionesBaja = r.texto;
        this.mejorandoRedaccion.set(false);
      },
      error: (e) => {
        this.mejorandoRedaccion.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  enviarAtenderCmp() {
    this.ocupado.set(true);
    this.api
      .atenderCmp(this.id(), {
        resultado: this.resultadoCmp,
        diagnostico: this.resultadoCmp === 'reparado' ? this.diagnostico : undefined,
        solucion: this.resultadoCmp === 'reparado' ? this.solucion : undefined,
        refacciones: this.resultadoCmp === 'reparado' ? this.refacciones || undefined : undefined,
        observaciones: this.resultadoCmp === 'baja' ? this.observacionesBaja : undefined,
        fotos: this.resultadoCmp === 'baja' ? this.fotosBaja : undefined,
      })
      .subscribe({
        next: (t) => {
          this.avisoCustodia.set(t.aviso_custodia);
          this.aplicar(t);
        },
        error: (e) => this.falla(e),
      });
  }

  /** Abre el dictamen en una pestaña nueva. */
  descargarDictamen() {
    this.api.descargarDictamen(this.id()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Abre la cédula de salida en una pestaña nueva. */
  descargarCedulaSalida() {
    this.api.descargarCedulaSalida(this.id()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Abre la cédula de entrada en una pestaña nueva. */
  descargarCedulaEntrada() {
    this.api.descargarCedulaEntrada(this.id()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
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
