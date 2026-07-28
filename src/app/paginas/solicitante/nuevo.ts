import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import {
  duracion,
  esCampoCuentaCorreo,
  esCampoInventario,
  mensajeError,
  NOMBRE_PRIORIDAD,
  revisaCuentaCorreo,
} from '../../core/formato';
import type { Bien, Catalogos, Problema } from '../../core/modelos';

/** Lo que cabe en ticket.contexto (VARCHAR 160). */
const LARGO_CONTEXTO = 160;

@Component({
  selector: 'app-nuevo',
  imports: [FormsModule],
  templateUrl: './nuevo.html',
})
export class Nuevo {
  private readonly api = inject(TicketsService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly catalogos = signal<Catalogos | null>(null);
  readonly servicioId = signal<number | null>(null);
  readonly claveProblema = signal('');
  readonly error = signal('');
  readonly guardando = signal(false);

  /** Se refleja en una senal para poder validar el correo mientras se escribe. */
  readonly contextoV = signal('');
  texto = '';
  extension = '';

  readonly dur = duracion;
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;

  /** Dominio que exige el backend. Viaja en los catalogos. */
  readonly dominio = computed(() => this.catalogos()?.correo_dominio ?? '');

  /** true cuando el campo adicional del catalogo es una cuenta de correo. */
  readonly esCorreo = computed(() => esCampoCuentaCorreo(this.problema()?.campo_adicional));

  /**
   * Aviso bajo el campo. Solo aparece cuando ya hay algo escrito: reganar al
   * solicitante por un campo vacio que aun no toca no ayuda a nadie.
   */
  readonly avisoCorreo = computed(() => {
    if (!this.esCorreo() || !this.contextoV().trim()) return '';
    return revisaCuentaCorreo(this.contextoV(), this.dominio());
  });

  /* ---------------- bienes bajo resguardo ---------------- */

  /** true cuando el campo adicional del catalogo pide numero de inventario. */
  readonly esInventario = computed(() => esCampoInventario(this.problema()?.campo_adicional));

  readonly bienes = signal<Bien[]>([]);
  readonly cargandoBienes = signal(false);
  /** Explica por que no hay lista; con eso la pantalla ofrece captura manual. */
  readonly motivoBienes = signal('');
  /** Numeros de inventario elegidos, en el orden en que se marcaron. */
  readonly seleccion = signal<string[]>([]);
  /** Se consulta una sola vez por sesion de pantalla, no en cada problema. */
  private bienesPedidos = false;

  /** Lo que se manda como contexto: los inventarios elegidos o el texto capturado. */
  readonly contextoFinal = computed(() =>
    this.esInventario() && this.bienes().length
      ? this.seleccion().join(', ')
      : this.contextoV().trim(),
  );

  readonly excedeLargo = computed(() => this.contextoFinal().length > LARGO_CONTEXTO);

  /** Solo los servicios que puede reportar un usuario (§3). */
  readonly servicios = computed(() =>
    (this.catalogos()?.servicios ?? []).filter((s) => s.origen === 'usuario'),
  );

  readonly problemas = computed(() =>
    (this.catalogos()?.problemas ?? []).filter(
      (p) => p.origen === 'usuario' && p.servicio_id === this.servicioId(),
    ),
  );

  readonly problema = computed<Problema | null>(
    () => this.problemas().find((p) => p.clave === this.claveProblema()) ?? null,
  );

  /** Minutos objetivo de la prioridad que impuso el catálogo. */
  readonly objetivo = computed(() => {
    const p = this.problema();
    if (!p) return 0;
    return (
      this.catalogos()?.prioridades.find((x) => x.clave === p.prioridad)?.minutos_resolucion ?? 0
    );
  });

  constructor() {
    this.extension = this.auth.usuario()?.extension ?? '';
    this.api.catalogos().subscribe({
      next: (c) => this.catalogos.set(c),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  cambiaServicio(valor: string) {
    this.servicioId.set(valor ? Number(valor) : null);
    this.claveProblema.set('');
    this.limpiar();
  }

  /**
   * Al elegir un problema que pide inventario se traen los resguardos. Se pide
   * hasta ese momento —y una sola vez— para no llamar al sistema de bienes en
   * cada apertura del formulario.
   */
  cambiaProblema(clave: string) {
    this.claveProblema.set(clave);
    this.seleccion.set([]);
    if (this.esInventario() && !this.bienesPedidos) this.cargaBienes();
  }

  private cargaBienes() {
    this.bienesPedidos = true;
    this.cargandoBienes.set(true);
    this.api.bienes().subscribe({
      next: (r) => {
        this.cargandoBienes.set(false);
        this.bienes.set(r.bienes);
        this.motivoBienes.set(r.bienes.length ? '' : (r.motivo ?? 'No tienes bienes resguardados.'));
      },
      error: () => {
        this.cargandoBienes.set(false);
        this.bienes.set([]);
        this.motivoBienes.set(
          'No se pudo consultar el sistema de bienes. Captura el número de inventario a mano.',
        );
        /* Se permite reintentar: pudo ser un corte momentaneo. */
        this.bienesPedidos = false;
      },
    });
  }

  /** Multi-select: un mismo reporte puede abarcar varios bienes del resguardo. */
  alternaBien(inventario: string) {
    const actual = this.seleccion();
    this.seleccion.set(
      actual.includes(inventario)
        ? actual.filter((i) => i !== inventario)
        : [...actual, inventario],
    );
  }

  limpiar() {
    this.contextoV.set('');
    this.seleccion.set([]);
    this.texto = '';
  }

  guardar() {
    const p = this.problema();
    this.error.set('');

    if (!p) {
      this.error.set('Elige el tipo de servicio y el problema.');
      return;
    }
    if (p.campo_adicional && !this.contextoFinal()) {
      this.error.set(
        this.esInventario() && this.bienes().length
          ? 'Elige al menos un bien de tu resguardo.'
          : `Captura: ${p.campo_adicional}`,
      );
      return;
    }
    if (this.excedeLargo()) {
      this.error.set(
        `Elegiste demasiados bienes para un solo ticket (máximo ${LARGO_CONTEXTO} caracteres). ` +
          'Registra los demás en otro reporte.',
      );
      return;
    }
    if (this.esCorreo()) {
      const aviso = revisaCuentaCorreo(this.contextoV(), this.dominio());
      if (aviso) {
        this.error.set(aviso);
        return;
      }
    }
    if (p.requiere_texto && !this.texto.trim()) {
      this.error.set('Describe el problema.');
      return;
    }

    this.guardando.set(true);
    this.api
      .crear({
        problema: p.clave,
        /* La cuenta se manda en minusculas: asi queda igual en toda la bitacora. */
        contexto: this.esCorreo()
          ? this.contextoFinal().toLowerCase()
          : this.contextoFinal() || undefined,
        texto: p.requiere_texto ? this.texto.trim() : undefined,
        extension: this.extension.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          void this.router.navigate(['/mis-tickets']);
        },
        error: (e) => {
          this.guardando.set(false);
          this.error.set(mensajeError(e));
        },
      });
  }
}
