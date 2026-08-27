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
import type { Bien, CandidatoSaf, Catalogos, Problema } from '../../core/modelos';

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
  /** Equipo de computo: un solo equipo por ticket, sacado de una API distinta. */
  readonly esCmp = computed(() => this.problema()?.servicio_clave === 'CMP');

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

  /** Solo los servicios que puede reportar un usuario (§3) y que su perfil puede elegir. */
  readonly servicios = computed(() =>
    (this.catalogos()?.servicios ?? []).filter((s) => s.origen === 'usuario' && s.puedeRegistrar),
  );

  readonly servicioActual = computed(
    () => this.servicios().find((s) => s.id === this.servicioId()) ?? null,
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

  /* ---------------- §2 registrar a nombre de otro usuario (admin, operador y gestor) ---------------- */

  /** Solo el admin ve el tiempo objetivo de resolucion; no aplica a operador/gestor. */
  readonly esAdmin = computed(() => this.auth.rol() === 'admin');
  /**
   * Admin, operador y gestor pueden elegir a nombre de quien registran el
   * ticket — excepto en un servicio restringido (administrable desde el
   * catalogo, ver ServicioUsuarioPermitido en el backend): ahi el ticket
   * siempre queda a nombre de quien esta en sesion, sin excepcion salvo el
   * admin. Tambien queda descartado, sin importar el servicio, para quien
   * trae marcado siempreANombrePropio (ver RFC_SIEMPRE_A_NOMBRE_PROPIO en
   * el backend).
   */
  readonly puedeElegirUsuario = computed(
    () =>
      ['admin', 'operador', 'gestor'].includes(this.auth.rol() ?? '') &&
      !this.auth.usuario()?.siempreANombrePropio &&
      (this.esAdmin() || !this.servicioActual()?.restringido),
  );

  busquedaUsuario = '';
  readonly resultadosUsuario = signal<CandidatoSaf[]>([]);
  readonly buscandoUsuario = signal(false);
  readonly usuarioElegido = signal<CandidatoSaf | null>(null);
  private temporizadorUsuario: ReturnType<typeof setTimeout> | null = null;

  onBuscarUsuario() {
    if (this.temporizadorUsuario) clearTimeout(this.temporizadorUsuario);
    const texto = this.busquedaUsuario.trim();
    if (texto.length < 3) {
      this.resultadosUsuario.set([]);
      return;
    }
    this.temporizadorUsuario = setTimeout(() => {
      this.buscandoUsuario.set(true);
      this.api.buscarSolicitantes(texto).subscribe({
        next: (r) => {
          this.buscandoUsuario.set(false);
          this.resultadosUsuario.set(r);
        },
        error: (e) => {
          this.buscandoUsuario.set(false);
          this.error.set(mensajeError(e));
        },
      });
    }, 350);
  }

  elegirUsuario(c: CandidatoSaf) {
    this.usuarioElegido.set(c);
    this.busquedaUsuario = '';
    this.resultadosUsuario.set([]);
    this.reiniciaBienes();
  }

  quitarUsuario() {
    this.usuarioElegido.set(null);
    this.reiniciaBienes();
  }

  /**
   * Los resguardos son de a quien se le va a registrar el ticket, no de quien
   * lo esta armando: si cambia el usuario elegido (o se quita), hay que
   * volver a pedirlos —el inventario que ya se hubiera mostrado era de otra
   * persona—.
   */
  private reiniciaBienes() {
    this.bienesPedidos = false;
    this.bienes.set([]);
    this.seleccion.set([]);
    if (this.esInventario()) this.cargaBienes();
  }

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
    /* Un servicio restringido (ver puedeElegirUsuario) siempre es a nombre propio. */
    if (!this.puedeElegirUsuario()) this.usuarioElegido.set(null);
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
    const deOtro = this.usuarioElegido()?.id_usuario_saf;
    const peticion = deOtro
      ? this.esCmp()
        ? this.api.bienesCmpDe(deOtro)
        : this.api.bienesDe(deOtro)
      : this.esCmp()
        ? this.api.bienesCmp()
        : this.api.bienes();
    peticion.subscribe({
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

  /** Equipo de computo: se elige un solo equipo, el que se va a reparar. */
  elegirBienUnico(inventario: string) {
    this.seleccion.set([inventario]);
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

  /** Boton "Limpiar": reinicia todo el formulario, no solo el contexto del problema actual. */
  limpiarFormulario() {
    this.servicioId.set(null);
    this.claveProblema.set('');
    this.extension = this.auth.usuario()?.extension ?? '';
    this.error.set('');
    this.limpiar();
  }

  regresar() {
    void this.router.navigate(['/mis-tickets']);
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
        a_nombre_de: this.puedeElegirUsuario()
          ? (this.usuarioElegido()?.id_usuario_saf ?? undefined)
          : undefined,
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
