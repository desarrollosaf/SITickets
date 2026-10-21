import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import {
  duracion,
  esCampoCantidadEquipos,
  esCampoCuentaCorreo,
  esCampoInventario,
  esCampoModeloImpresora,
  mensajeError,
  NOMBRE_PRIORIDAD,
  quitarAcentos,
  revisaCuentaCorreo,
} from '../../core/formato';
import type { Bien, CandidatoSaf, Catalogos, Problema, TicketDetalle } from '../../core/modelos';

/** Lo que cabe en ticket.contexto (VARCHAR 160). */
const LARGO_CONTEXTO = 160;

/** Icono y color de cada tarjeta de servicio, por clave del catalogo. */
const ASPECTO_SERVICIO: Record<string, { icono: string; tono: string }> = {
  CMP: { icono: 'bi-pc-display', tono: '#2b6cb0' },
  IMP: { icono: 'bi-printer', tono: '#6d35c9' },
  IMPA: { icono: 'bi-printer-fill', tono: '#8e44ad' },
  TEL: { icono: 'bi-telephone', tono: '#0f8a8a' },
  NET: { icono: 'bi-wifi', tono: '#1f8a56' },
  SIS: { icono: 'bi-window-stack', tono: '#d17b1f' },
  COR: { icono: 'bi-envelope-at', tono: '#c0392b' },
  CAM: { icono: 'bi-camera-video', tono: '#45566b' },
  CNA: { icono: 'bi-file-earmark-check', tono: '#b8860b' },
  CAB: { icono: 'bi-ethernet', tono: '#1d4f86' },
  INV: { icono: 'bi-clipboard-check', tono: '#5b6b7c' },
  MTO: { icono: 'bi-tools', tono: '#0f8a8a' },
  CFG: { icono: 'bi-gear', tono: '#45566b' },
};

@Component({
  selector: 'app-nuevo',
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './nuevo.html',
  styleUrl: './nuevo.scss',
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
  inmuebleId = '';
  piso = '';

  /**
   * Nombre del inmueble elegido, tal como se manda al backend (el piso va aparte, en `piso`).
   * inmuebleId no es signal (va con ngModel), asi que esto NO puede ser un computed():
   * nunca detectaria el cambio y se quedaria pegado en el valor inicial.
   */
  edificioAtencion(): string {
    const inmueble = this.catalogos()?.inmuebles.find((i) => String(i.id) === this.inmuebleId);
    return inmueble ? `${inmueble.dependencia} - ${inmueble.ubicacion}`.slice(0, 160) : '';
  }

  readonly dur = duracion;
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;
  readonly anio = new Date().getFullYear();

  /** Ticket recien creado: con valor, la pantalla muestra el folio en vez del formulario. */
  readonly creado = signal<TicketDetalle | null>(null);

  /** El solicitante no ve prioridades (igual que en sus listas); el resto si. */
  readonly muestraPrioridad = computed(() => this.auth.rol() !== 'solicitante');

  iconoServicio(clave: string | null | undefined): string {
    return ASPECTO_SERVICIO[clave ?? '']?.icono ?? 'bi-life-preserver';
  }

  tonoServicio(clave: string | null | undefined): string {
    return ASPECTO_SERVICIO[clave ?? '']?.tono ?? '#2b6cb0';
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  }

  /** Desplegable de problemas: abierto o cerrado. */
  readonly listaProblemas = signal(false);

  alternarListaProblemas() {
    this.listaProblemas.update((a) => !a);
  }

  elegirProblema(clave: string) {
    this.cambiaProblema(clave);
    this.listaProblemas.set(false);
  }

  /** Clic en cualquier parte fuera del desplegable lo cierra (el desplegable detiene su propio clic). */
  @HostListener('document:click')
  cerrarListaProblemas() {
    this.listaProblemas.set(false);
  }

  /** Muestra del color en los botones de toner. */
  readonly muestraColor: Record<string, string> = {
    Negro: '#1b2434',
    Cyan: '#00aeef',
    Magenta: '#ec008c',
    Amarillo: '#ffd400',
  };

  /** "Limpiar" pide un segundo clic: borra todo y esta junto a "Registrar". */
  readonly confirmarLimpiar = signal(false);
  private temporizadorLimpiar: ReturnType<typeof setTimeout> | null = null;

  pedirLimpiar() {
    if (this.confirmarLimpiar()) {
      this.confirmarLimpiar.set(false);
      this.limpiarFormulario();
      return;
    }
    this.confirmarLimpiar.set(true);
    if (this.temporizadorLimpiar) clearTimeout(this.temporizadorLimpiar);
    this.temporizadorLimpiar = setTimeout(() => this.confirmarLimpiar.set(false), 3000);
  }

  /** Dominio que exige el backend. Viaja en los catalogos. */
  readonly dominio = computed(() => this.catalogos()?.correo_dominio ?? '');

  /** true cuando el campo adicional del catalogo es una cuenta de correo. */
  readonly esCorreo = computed(() => esCampoCuentaCorreo(this.problema()?.campo_adicional));

  /**
   * Por omision el campo solo captura la parte local (antes de la @): el
   * dominio institucional se arma solo. «Usar otro correo» lo cambia a un
   * campo libre, para cuando la cuenta no es del dominio institucional.
   */
  readonly correoLibre = signal(false);

  /** contextoV es la parte local en modo institucional, o la cuenta completa en modo libre. */
  readonly correoParaEnviar = computed(() =>
    this.correoLibre() ? this.contextoV().trim() : `${this.contextoV().trim()}@${this.dominio()}`,
  );

  toggleCorreoLibre(libre: boolean) {
    this.correoLibre.set(libre);
    /* Cambiar de modo a medio escribir deja el valor armado a medias
       (ej. "nombre@dominio.com@congresoedomex.gob.mx"); mas claro empezar de cero. */
    this.contextoV.set('');
  }

  /**
   * Aviso bajo el campo. Solo aparece cuando ya hay algo escrito: reganar al
   * solicitante por un campo vacio que aun no toca no ayuda a nadie.
   */
  readonly avisoCorreo = computed(() => {
    if (!this.esCorreo() || !this.contextoV().trim()) return '';
    return revisaCuentaCorreo(this.correoParaEnviar(), this.correoLibre() ? '' : this.dominio());
  });

  /* ---------------- modelo de impresora ---------------- */

  /** true cuando el campo adicional del catalogo pide el modelo de la impresora. */
  readonly esModeloImpresora = computed(() =>
    esCampoModeloImpresora(this.problema()?.campo_adicional),
  );
  /** IMPA: parque de impresoras arrendadas, con catalogo de modelos para buscar/elegir. */
  readonly esModeloImpresoraCatalogo = computed(
    () => this.esModeloImpresora() && this.problema()?.servicio_clave === 'IMPA',
  );
  /** IMP: impresoras propias, sin catalogo central — el modelo se captura a mano. */
  readonly esModeloImpresoraLibre = computed(
    () => this.esModeloImpresora() && this.problema()?.servicio_clave === 'IMP',
  );
  readonly modelosImpresora = signal<string[]>([]);
  readonly cargandoModelos = signal(false);
  readonly modeloElegido = signal('');
  /** Lo que se va escribiendo para filtrar la lista (estilo "buscar usuario"). */
  readonly modeloBusqueda = signal('');
  /** Se consulta una sola vez por sesion de pantalla, no en cada problema. */
  private modelosPedidos = false;

  readonly modelosFiltrados = computed(() => {
    const q = quitarAcentos(this.modeloBusqueda().trim()).toLowerCase();
    const lista = this.modelosImpresora();
    return q ? lista.filter((m) => quitarAcentos(m).toLowerCase().includes(q)) : lista;
  });

  elegirModelo(modelo: string) {
    this.modeloElegido.set(modelo);
    this.modeloBusqueda.set('');
  }

  quitarModelo() {
    this.modeloElegido.set('');
  }

  private cargaModelosImpresora() {
    this.modelosPedidos = true;
    this.cargandoModelos.set(true);
    this.api.modelosImpresora().subscribe({
      next: (r) => {
        this.cargandoModelos.set(false);
        this.modelosImpresora.set(r);
      },
      error: () => {
        this.cargandoModelos.set(false);
        this.modelosImpresora.set([]);
        /* Se permite reintentar: pudo ser un corte momentaneo. */
        this.modelosPedidos = false;
      },
    });
  }

  /* ---------------- bienes bajo resguardo ---------------- */

  /** true cuando el campo adicional del catalogo pide numero de inventario. */
  readonly esInventario = computed(() => esCampoInventario(this.problema()?.campo_adicional));
  /** true cuando el campo adicional pide cuantos equipos afecta la falla (servicio INTERNET): solo numeros. */
  readonly esCantidadEquipos = computed(() =>
    esCampoCantidadEquipos(this.problema()?.campo_adicional),
  );

  /**
   * El input type="number" usa NumberValueAccessor: escribe un `number` (o null),
   * no un string. contextoV es siempre string en el resto de la clase (se le
   * llama .trim() en varios lados), asi que aqui se normaliza de vuelta.
   */
  onCantidadEquiposChange(valor: number | string | null) {
    this.contextoV.set(valor === null || valor === undefined ? '' : String(valor));
  }

  /** Equipo de computo: un solo equipo por ticket, sacado de una API distinta. */
  readonly esCmp = computed(() => this.problema()?.servicio_clave === 'CMP');

  /* ---------------- hora de atencion (servicio CNA, Cartas de no adeudo) ---------------- */

  /** Dia y hora en que el tecnico puede ir a revisar los bienes: dos inputs, se combinan al enviar. */
  readonly esCna = computed(() => this.problema()?.servicio_clave === 'CNA');
  fechaAtencion = '';
  horaAtencion = '';
  /** ISO completo para el backend, o null si falta alguno de los dos campos. */
  readonly horaAtencionIso = computed(() => {
    if (!this.fechaAtencion || !this.horaAtencion) return null;
    const fecha = new Date(`${this.fechaAtencion}T${this.horaAtencion}`);
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
  });

  /* ---------------- color de toner (IMP-01 / IMPA-01, solicitud de toner/cartucho) ---------------- */

  /** Este problema ademas del modelo de impresora pide el color de toner a cambiar. */
  readonly esColorToner = computed(() =>
    ['IMP-01', 'IMPA-01'].includes(this.problema()?.clave ?? ''),
  );
  readonly coloresToner = ['Negro', 'Cyan', 'Magenta', 'Amarillo'];
  /** Puede ser mas de un color (ej. se acaban negro y cyan a la vez). */
  coloresElegidos: string[] = [];

  alternarColorToner(color: string) {
    this.coloresElegidos = this.coloresElegidos.includes(color)
      ? this.coloresElegidos.filter((c) => c !== color)
      : [...this.coloresElegidos, color];
  }

  /* ---------------- traslado de impresora arrendada (IMPA-09) ---------------- */

  /**
   * IMPA-09: el campo adicional del catalogo (contexto) ya pide la
   * ubicacion destino; ademas hace falta el modelo que se traslada, asi
   * que reusa el mismo catalogo/widget de IMPA (modelosImpresora,
   * modeloElegido…) como un segundo campo independiente.
   */
  readonly esTrasladoImpa = computed(() => this.problema()?.clave === 'IMPA-09');

  readonly bienes = signal<Bien[]>([]);
  readonly cargandoBienes = signal(false);
  /** Explica por que no hay lista; con eso la pantalla ofrece captura manual. */
  readonly motivoBienes = signal('');
  /** Numeros de inventario elegidos, en el orden en que se marcaron. */
  readonly seleccion = signal<string[]>([]);
  /** Se consulta una sola vez por sesion de pantalla, no en cada problema. */
  private bienesPedidos = false;

  /** Lo que se manda como contexto: los inventarios elegidos, la cuenta armada, el modelo elegido, o el texto capturado. */
  readonly contextoFinal = computed(() => {
    if (this.esInventario() && this.bienes().length) return this.seleccion().join(', ');
    if (this.esCorreo()) return this.correoParaEnviar();
    if (this.esModeloImpresoraCatalogo() && this.modelosImpresora().length) return this.modeloElegido();
    return this.contextoV().trim();
  });

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
   * catalogo, ver ServicioUsuarioPermitido en el backend) que no tenga
   * permite_a_nombre_de habilitado: ahi el ticket siempre queda a nombre de
   * quien esta en sesion, sin excepcion salvo el admin. Tambien queda
   * descartado, sin importar el servicio, para quien trae marcado
   * siempreANombrePropio (ver RFC_SIEMPRE_A_NOMBRE_PROPIO en el backend).
   */
  readonly puedeElegirUsuario = computed(
    () =>
      ['admin', 'operador', 'gestor', 'validador', 'sistemas'].includes(this.auth.rol() ?? '') &&
      !this.auth.usuario()?.siempreANombrePropio &&
      (this.esAdmin() ||
        !this.servicioActual()?.restringido ||
        !!this.servicioActual()?.permite_a_nombre_de),
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
      this.api.buscarSolicitantes(texto, this.servicioId()).subscribe({
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

  /** Tarjeta de servicio: la elige y baja al paso del problema. */
  /** Con servicio elegido el paso 1 se reduce a una linea; "Cambiar" vuelve a mostrar las tarjetas. */
  readonly cambiandoServicio = signal(false);

  elegirServicio(id: number) {
    this.cambiandoServicio.set(false);
    if (this.servicioId() === id) return;
    this.cambiaServicio(String(id));
    this.listaProblemas.set(false);
  }

  cambiaServicio(valor: string) {
    this.servicioId.set(valor ? Number(valor) : null);
    this.claveProblema.set('');
    this.limpiar();
    /* Un servicio restringido (ver puedeElegirUsuario) siempre es a nombre propio. */
    if (!this.puedeElegirUsuario()) this.usuarioElegido.set(null);
    /* Los dados de baja solo valen para Cartas de no adeudo: al cambiar de
       servicio se descarta la eleccion y la busqueda, que dependian de el. */
    if (this.usuarioElegido()?.activo === false) this.usuarioElegido.set(null);
    this.resultadosUsuario.set([]);
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
    if ((this.esModeloImpresoraCatalogo() || this.esTrasladoImpa()) && !this.modelosPedidos) {
      this.cargaModelosImpresora();
    }
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
    this.correoLibre.set(false);
    this.modeloElegido.set('');
    this.modeloBusqueda.set('');
    this.coloresElegidos = [];
    this.fechaAtencion = '';
    this.horaAtencion = '';
  }

  /** Boton "Limpiar": reinicia todo el formulario, no solo el contexto del problema actual. */
  limpiarFormulario() {
    this.servicioId.set(null);
    this.claveProblema.set('');
    this.extension = this.auth.usuario()?.extension ?? '';
    this.inmuebleId = '';
    this.piso = '';
    this.error.set('');
    this.cambiandoServicio.set(false);
    this.limpiar();
  }

  /** Desde la pantalla de exito: formulario en blanco para otro reporte. */
  registrarOtro() {
    this.creado.set(null);
    this.usuarioElegido.set(null);
    this.limpiarFormulario();
    window.scrollTo({ top: 0 });
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
    /* Escribio un nombre pero no eligio a nadie de la lista: sin este aviso el
       ticket quedaria a nombre de quien esta en sesion sin que lo note. */
    if (this.puedeElegirUsuario() && !this.usuarioElegido() && this.busquedaUsuario.trim()) {
      this.error.set(
        'Escribiste un nombre en «Registrar a nombre de» pero no elegiste a nadie de la lista. ' +
          'Elígelo, o borra el campo para registrarlo a tu nombre.',
      );
      return;
    }
    if (p.campo_adicional && !this.contextoFinal()) {
      this.error.set(
        this.esInventario() && this.bienes().length
          ? 'Elige al menos un bien de tu resguardo.'
          : this.esModeloImpresoraCatalogo() && this.modelosImpresora().length
            ? 'Elige el modelo de impresora.'
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
      const aviso = revisaCuentaCorreo(this.correoParaEnviar(), this.correoLibre() ? '' : this.dominio());
      if (aviso) {
        this.error.set(aviso);
        return;
      }
    }
    if (this.esCantidadEquipos() && !/^\d+$/.test(this.contextoFinal())) {
      this.error.set(`Captura solo números: ${p.campo_adicional}`);
      return;
    }
    if (p.requiere_texto && !this.texto.trim()) {
      this.error.set('Describe el problema.');
      return;
    }
    if (!this.inmuebleId) {
      this.error.set('Elige el edificio o ubicación donde se atenderá.');
      return;
    }
    if (this.esColorToner() && !this.coloresElegidos.length) {
      this.error.set('Indica que color(es) de toner se van a cambiar.');
      return;
    }
    if (this.esTrasladoImpa() && !this.modeloElegido().trim()) {
      this.error.set('Elige el modelo de impresora que se va a trasladar.');
      return;
    }
    if (this.esCna() && !this.horaAtencionIso()) {
      this.error.set('Indica el día y la hora en que el técnico puede ir a revisar los bienes.');
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
        edificio_atencion: this.edificioAtencion() || undefined,
        inmueble_id: this.inmuebleId ? Number(this.inmuebleId) : undefined,
        piso: this.piso.trim() || undefined,
        hora_atencion: this.esCna() ? (this.horaAtencionIso() ?? undefined) : undefined,
        correo_libre: this.esCorreo() ? this.correoLibre() : undefined,
        color_toner: this.esColorToner() ? this.coloresElegidos.join(', ') : undefined,
        modelo_traslado: this.esTrasladoImpa() ? this.modeloElegido().trim() : undefined,
        a_nombre_de: this.puedeElegirUsuario()
          ? (this.usuarioElegido()?.id_usuario_saf ?? undefined)
          : undefined,
      })
      .subscribe({
        next: (t) => {
          this.guardando.set(false);
          this.creado.set(t);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (e) => {
          this.guardando.set(false);
          this.error.set(mensajeError(e));
        },
      });
  }
}
