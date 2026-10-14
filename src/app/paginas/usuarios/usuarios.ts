import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsuariosService } from '../../core/usuarios.service';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, quitarAcentos } from '../../core/formato';
import type { CandidatoSaf, RolCatalogo, Servicio, UsuarioStaff } from '../../core/modelos';

interface DependenciaOpcion {
  id: number;
  nombre: string;
}

/* Mapa de respaldo para roles historicos: un rol nuevo del catalogo (ver
 * RolCatalogo) usa directamente su `nombre` y el estilo por omision del
 * badge, sin necesidad de tocar este mapa. */
const NOMBRE_ROL: Record<string, string> = {
  tecnico: 'Técnico',
  jefe: 'Jefe de departamento',
  admin: 'Administrador',
  proveedor: 'Proveedor externo',
  operador: 'Operador',
  gestor: 'Gestor',
};

const CLASE_ROL: Record<string, string> = {
  admin: 'text-bg-primary-subtle text-primary-emphasis',
  tecnico: 'text-bg-info-subtle text-info-emphasis',
  jefe: 'text-bg-warning-subtle text-warning-emphasis',
  proveedor: 'text-bg-secondary-subtle text-secondary-emphasis',
  operador: 'text-bg-primary-subtle text-primary-emphasis',
  gestor: 'text-bg-success-subtle text-success-emphasis',
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
  rol = '';
  servicioIds: number[] = [];
  dependenciaIds: number[] = [];

  /* ---------------- tipo(s) de servicio (solo si rol es tecnico) ---------------- */

  readonly servicios = signal<Servicio[]>([]);
  /** Activos y distintos de "solicitante": lo que puede elegirse al dar de alta personal. */
  readonly roles = signal<RolCatalogo[]>([]);
  /** Solo rol validador: dependencias que puede revisar antes de turnar a tecnico. */
  readonly dependencias = signal<DependenciaOpcion[]>([]);

  /** Metodo normal, no computed(): rol es una propiedad plana que cambia por ngModel. */
  mostrarServicio() {
    return this.rol === 'tecnico';
  }

  mostrarDependencias() {
    return this.rol === 'validador';
  }

  alternarServicio(id: number) {
    this.servicioIds = this.servicioIds.includes(id)
      ? this.servicioIds.filter((s) => s !== id)
      : [...this.servicioIds, id];
  }

  alternarDependencia(id: number) {
    this.dependenciaIds = this.dependenciaIds.includes(id)
      ? this.dependenciaIds.filter((d) => d !== id)
      : [...this.dependenciaIds, id];
  }

  /* ---------------- personal ya registrado ---------------- */

  readonly staff = signal<UsuarioStaff[]>([]);
  filtroStaff = '';
  readonly porPagina = 8;
  readonly paginaActual = signal(1);

  constructor() {
    this.tickets.catalogos().subscribe({ next: (c) => this.servicios.set(c.servicios) });
    this.tickets.roles().subscribe({
      next: (r) => this.roles.set(r.filter((x) => x.activo && x.clave !== 'solicitante')),
    });
    this.tickets.organizacion().subscribe({ next: (o) => this.dependencias.set(o.dependencias) });
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
    this.servicioIds = [];
    this.dependenciaIds = [];
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
        servicio_ids: this.mostrarServicio() && this.servicioIds.length ? this.servicioIds : undefined,
        dependencia_ids:
          this.mostrarDependencias() && this.dependenciaIds.length ? this.dependenciaIds : undefined,
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

  editRol = 'tecnico';
  editCorreo = '';
  editExtension = '';
  editServicioIds: number[] = [];
  editDependenciaIds: number[] = [];

  mostrarServicioEdicion() {
    return this.editRol === 'tecnico';
  }

  mostrarDependenciasEdicion() {
    return this.editRol === 'validador';
  }

  alternarServicioEdicion(id: number) {
    this.editServicioIds = this.editServicioIds.includes(id)
      ? this.editServicioIds.filter((s) => s !== id)
      : [...this.editServicioIds, id];
  }

  alternarDependenciaEdicion(id: number) {
    this.editDependenciaIds = this.editDependenciaIds.includes(id)
      ? this.editDependenciaIds.filter((d) => d !== id)
      : [...this.editDependenciaIds, id];
  }

  abrirEditar(u: UsuarioStaff) {
    this.editando.set(u);
    this.editRol = u.rol;
    this.editCorreo = u.correo ?? '';
    this.editExtension = u.extension ?? '';
    this.editServicioIds = [...u.servicio_ids];
    this.editDependenciaIds = [...u.dependencia_ids_validador];
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
        servicio_ids: this.mostrarServicioEdicion() ? this.editServicioIds : undefined,
        dependencia_ids: this.mostrarDependenciasEdicion() ? this.editDependenciaIds : undefined,
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
        rol: u.rol,
        correo: u.correo ?? undefined,
        extension: u.extension ?? undefined,
        servicio_ids: u.servicio_ids,
        dependencia_ids: u.dependencia_ids_validador,
        activo: !u.activo,
      })
      .subscribe({
        next: () => this.cargarStaff(),
        error: (e) => this.error.set(mensajeError(e)),
      });
  }
}
