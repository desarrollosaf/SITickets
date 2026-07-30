import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsuariosService } from '../../core/usuarios.service';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, quitarAcentos } from '../../core/formato';
import type { CandidatoSaf, Servicio, UsuarioStaff } from '../../core/modelos';

const NOMBRE_ROL: Record<string, string> = {
  tecnico: 'Técnico',
  jefe: 'Jefe de departamento',
  admin: 'Administrador',
  proveedor: 'Proveedor externo',
};

const CLASE_ROL: Record<string, string> = {
  admin: 'text-bg-primary-subtle text-primary-emphasis',
  tecnico: 'text-bg-info-subtle text-info-emphasis',
  jefe: 'text-bg-warning-subtle text-warning-emphasis',
  proveedor: 'text-bg-secondary-subtle text-secondary-emphasis',
};

/** §12 · alta de personal interno: se busca en saf, se confirma rol (y servicio si es tecnico). */
@Component({
  selector: 'app-usuarios',
  imports: [FormsModule],
  templateUrl: './usuarios.html',
})
export class Usuarios {
  private readonly api = inject(UsuariosService);
  private readonly tickets = inject(TicketsService);

  readonly nombreRol = NOMBRE_ROL;
  readonly claseRol = CLASE_ROL;

  /* ---------------- busqueda en saf ---------------- */

  busqueda = '';
  readonly resultados = signal<CandidatoSaf[]>([]);
  readonly buscando = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  onBuscar() {
    if (this.temporizador) clearTimeout(this.temporizador);
    const texto = this.busqueda.trim();
    if (texto.length < 3) {
      this.resultados.set([]);
      return;
    }
    this.temporizador = setTimeout(() => {
      this.buscando.set(true);
      this.api.buscarSaf(texto).subscribe({
        next: (r) => {
          this.buscando.set(false);
          this.resultados.set(r);
        },
        error: (e) => {
          this.buscando.set(false);
          this.error.set(mensajeError(e));
        },
      });
    }, 350);
  }

  /* ---------------- formulario de alta ---------------- */

  readonly seleccionado = signal<CandidatoSaf | null>(null);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly errorForm = signal('');
  readonly aviso = signal('');

  correo = '';
  extension = '';
  rol: '' | 'tecnico' | 'jefe' | 'admin' | 'proveedor' = '';
  servicioId: number | null = null;

  /* ---------------- tipo de servicio (solo si rol es tecnico) ---------------- */

  readonly servicios = signal<Servicio[]>([]);

  /** Metodo normal, no computed(): rol es una propiedad plana que cambia por ngModel. */
  mostrarServicio() {
    return this.rol === 'tecnico';
  }

  /* ---------------- personal ya registrado ---------------- */

  readonly staff = signal<UsuarioStaff[]>([]);
  filtroStaff = '';
  readonly porPagina = 8;
  readonly paginaActual = signal(1);

  constructor() {
    this.tickets.catalogos().subscribe({ next: (c) => this.servicios.set(c.servicios) });
    this.cargarStaff();
  }

  private cargarStaff() {
    this.api.listar().subscribe({
      next: (s) => {
        this.staff.set(s);
        this.paginaActual.set(1);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Filtra por nombre, rfc o rol. Metodo normal: filtroStaff es una propiedad plana, no signal. */
  staffFiltrado() {
    const texto = quitarAcentos(this.filtroStaff.trim().toLowerCase());
    if (!texto) return this.staff();
    return this.staff().filter(
      (u) =>
        quitarAcentos(u.nombre.toLowerCase()).includes(texto) ||
        (u.rfc ?? '').toLowerCase().includes(texto) ||
        quitarAcentos((this.nombreRol[u.rol] ?? u.rol).toLowerCase()).includes(texto),
    );
  }

  onFiltroStaff() {
    this.paginaActual.set(1);
  }

  totalPaginas() {
    return Math.max(1, Math.ceil(this.staffFiltrado().length / this.porPagina));
  }

  staffPagina() {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.staffFiltrado().slice(inicio, inicio + this.porPagina);
  }

  paginaAnterior() {
    this.paginaActual.update((p) => Math.max(1, p - 1));
  }

  paginaSiguiente() {
    this.paginaActual.update((p) => Math.min(this.totalPaginas(), p + 1));
  }

  elegir(c: CandidatoSaf) {
    this.seleccionado.set(c);
    this.resultados.set([]);
    this.busqueda = '';
    this.correo = '';
    this.extension = '';
    this.rol = '';
    this.servicioId = null;
    this.errorForm.set('');
    this.aviso.set('');
  }

  cancelar() {
    this.seleccionado.set(null);
  }

  guardar() {
    const c = this.seleccionado();
    if (!c) return;
    this.errorForm.set('');

    if (!this.rol) {
      this.errorForm.set('Elige el rol.');
      return;
    }

    this.guardando.set(true);
    this.api
      .registrar({
        id_usuario_saf: c.id_usuario_saf,
        correo: this.correo.trim() || undefined,
        extension: this.extension.trim() || undefined,
        rol: this.rol,
        servicio_id: this.mostrarServicio() && this.servicioId ? this.servicioId : undefined,
      })
      .subscribe({
        next: (r) => {
          this.guardando.set(false);
          this.seleccionado.set(null);
          this.aviso.set(`${r.nombre} quedó registrado como ${this.nombreRol[r.rol] ?? r.rol}.`);
          this.cargarStaff();
        },
        error: (e) => {
          this.guardando.set(false);
          this.errorForm.set(mensajeError(e));
        },
      });
  }

  /* ---------------- edicion de personal ya registrado ---------------- */

  readonly editando = signal<UsuarioStaff | null>(null);
  readonly guardandoEdicion = signal(false);
  readonly errorEdicion = signal('');

  editRol: 'tecnico' | 'jefe' | 'admin' | 'proveedor' = 'tecnico';
  editCorreo = '';
  editExtension = '';
  editServicioId: number | null = null;

  mostrarServicioEdicion() {
    return this.editRol === 'tecnico';
  }

  abrirEditar(u: UsuarioStaff) {
    this.editando.set(u);
    this.editRol = u.rol as 'tecnico' | 'jefe' | 'admin' | 'proveedor';
    this.editCorreo = u.correo ?? '';
    this.editExtension = u.extension ?? '';
    this.editServicioId = u.servicio_id;
    this.errorEdicion.set('');
  }

  cerrarEdicion() {
    this.editando.set(null);
  }

  guardarEdicion() {
    const u = this.editando();
    if (!u) return;
    this.errorEdicion.set('');
    this.guardandoEdicion.set(true);
    this.api
      .actualizar(u.id, {
        rol: this.editRol,
        correo: this.editCorreo.trim() || undefined,
        extension: this.editExtension.trim() || undefined,
        servicio_id: this.mostrarServicioEdicion() && this.editServicioId
          ? this.editServicioId
          : undefined,
        activo: u.activo,
      })
      .subscribe({
        next: () => {
          this.guardandoEdicion.set(false);
          this.editando.set(null);
          this.cargarStaff();
        },
        error: (e) => {
          this.guardandoEdicion.set(false);
          this.errorEdicion.set(mensajeError(e));
        },
      });
  }

  /** Baja/alta logica: no se borra el registro, solo se marca activo/inactivo. */
  alternarActivo(u: UsuarioStaff) {
    this.api
      .actualizar(u.id, {
        rol: u.rol as 'tecnico' | 'jefe' | 'admin' | 'proveedor',
        correo: u.correo ?? undefined,
        extension: u.extension ?? undefined,
        servicio_id: u.servicio_id ?? undefined,
        activo: !u.activo,
      })
      .subscribe({
        next: () => this.cargarStaff(),
        error: (e) => this.error.set(mensajeError(e)),
      });
  }
}
