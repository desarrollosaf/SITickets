import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError } from '../../core/formato';
import type { CandidatoSaf, Servicio, UsuarioPermitido } from '../../core/modelos';

/** §3 · Tipos de servicio: alta, edicion y quien puede registrar en los restringidos. */
@Component({
  selector: 'app-catalogo-servicios',
  imports: [FormsModule],
  templateUrl: './catalogo-servicios.html',
})
export class CatalogoServicios {
  private readonly api = inject(TicketsService);

  readonly servicios = signal<Servicio[]>([]);
  readonly error = signal('');

  /* ---------------- alta / edicion de un servicio ---------------- */

  readonly mostrarFormServicio = signal(false);
  readonly editandoServicioId = signal<number | null>(null);
  readonly guardandoServicio = signal(false);
  readonly errorFormServicio = signal('');

  svClave = '';
  svNombre = '';
  svPrefijo = '';
  svOrigen: 'usuario' | 'administrador' = 'usuario';
  svExterno = false;
  svMultiTecnico = false;
  svRestringido = false;

  /* ---------------- usuarios permitidos de un servicio restringido ---------------- */

  readonly mostrarPermitidos = signal(false);
  readonly servicioPermitidos = signal<Servicio | null>(null);
  readonly listaPermitidos = signal<UsuarioPermitido[]>([]);
  readonly cargandoPermitidos = signal(false);
  readonly errorPermitidos = signal('');

  busquedaPermitido = '';
  readonly resultadosPermitido = signal<CandidatoSaf[]>([]);
  readonly buscandoPermitido = signal(false);
  private temporizadorPermitido: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.api.catalogos().subscribe({
      next: (c) => this.servicios.set(c.servicios),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrirNuevoServicio() {
    this.editandoServicioId.set(null);
    this.svClave = '';
    this.svNombre = '';
    this.svPrefijo = '';
    this.svOrigen = 'usuario';
    this.svExterno = false;
    this.svMultiTecnico = false;
    this.svRestringido = false;
    this.errorFormServicio.set('');
    this.mostrarFormServicio.set(true);
  }

  abrirEditarServicio(s: Servicio) {
    this.editandoServicioId.set(s.id);
    this.svClave = s.clave;
    this.svNombre = s.nombre;
    this.svPrefijo = s.prefijo_folio;
    this.svOrigen = s.origen;
    this.svExterno = s.externo;
    this.svMultiTecnico = s.multi_tecnico;
    this.svRestringido = s.restringido;
    this.errorFormServicio.set('');
    this.mostrarFormServicio.set(true);
  }

  cancelarServicio() {
    this.mostrarFormServicio.set(false);
  }

  guardarServicio() {
    if (this.svNombre.trim().length < 2) {
      this.errorFormServicio.set('Captura el nombre.');
      return;
    }
    if (!this.svPrefijo.trim()) {
      this.errorFormServicio.set('Captura el prefijo del folio.');
      return;
    }

    const id = this.editandoServicioId();
    if (!id && this.svClave.trim().length < 2) {
      this.errorFormServicio.set('Captura la clave.');
      return;
    }

    this.guardandoServicio.set(true);
    this.errorFormServicio.set('');
    const datos = {
      nombre: this.svNombre.trim(),
      prefijo_folio: this.svPrefijo.trim(),
      origen: this.svOrigen,
      externo: this.svExterno,
      multi_tecnico: this.svMultiTecnico,
      restringido: this.svRestringido,
    };
    const peticion = id
      ? this.api.actualizarServicio(id, datos)
      : this.api.crearServicio({ ...datos, clave: this.svClave.trim() });

    peticion.subscribe({
      next: () => {
        this.guardandoServicio.set(false);
        this.mostrarFormServicio.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardandoServicio.set(false);
        this.errorFormServicio.set(mensajeError(e));
      },
    });
  }

  /** Baja logica: activo=false lo oculta del formulario de tickets sin borrarlo. */
  alternarActivoServicio(s: Servicio) {
    this.api.actualizarServicio(s.id, { activo: !s.activo }).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /* ---------------- usuarios permitidos de un servicio restringido ---------------- */

  abrirPermitidos(s: Servicio) {
    this.servicioPermitidos.set(s);
    this.listaPermitidos.set([]);
    this.busquedaPermitido = '';
    this.resultadosPermitido.set([]);
    this.errorPermitidos.set('');
    this.mostrarPermitidos.set(true);
    this.cargarPermitidos();
  }

  private cargarPermitidos() {
    const s = this.servicioPermitidos();
    if (!s) return;
    this.cargandoPermitidos.set(true);
    this.api.usuariosPermitidos(s.id).subscribe({
      next: (r) => {
        this.cargandoPermitidos.set(false);
        this.listaPermitidos.set(r);
      },
      error: (e) => {
        this.cargandoPermitidos.set(false);
        this.errorPermitidos.set(mensajeError(e));
      },
    });
  }

  cerrarPermitidos() {
    this.mostrarPermitidos.set(false);
  }

  onBuscarPermitido() {
    if (this.temporizadorPermitido) clearTimeout(this.temporizadorPermitido);
    const texto = this.busquedaPermitido.trim();
    if (texto.length < 3) {
      this.resultadosPermitido.set([]);
      return;
    }
    this.temporizadorPermitido = setTimeout(() => {
      this.buscandoPermitido.set(true);
      this.api.buscarSolicitantes(texto).subscribe({
        next: (r) => {
          this.buscandoPermitido.set(false);
          this.resultadosPermitido.set(r);
        },
        error: (e) => {
          this.buscandoPermitido.set(false);
          this.errorPermitidos.set(mensajeError(e));
        },
      });
    }, 350);
  }

  agregarPermitido(c: CandidatoSaf) {
    const s = this.servicioPermitidos();
    if (!s) return;
    this.errorPermitidos.set('');
    this.api.agregarUsuarioPermitido(s.id, c.id_usuario_saf).subscribe({
      next: () => {
        this.busquedaPermitido = '';
        this.resultadosPermitido.set([]);
        this.cargarPermitidos();
      },
      error: (e) => this.errorPermitidos.set(mensajeError(e)),
    });
  }

  quitarPermitido(p: UsuarioPermitido) {
    const s = this.servicioPermitidos();
    if (!s) return;
    this.errorPermitidos.set('');
    this.api.quitarUsuarioPermitido(s.id, p.id).subscribe({
      next: () => this.cargarPermitidos(),
      error: (e) => this.errorPermitidos.set(mensajeError(e)),
    });
  }
}
