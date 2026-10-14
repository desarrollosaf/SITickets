import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError } from '../../core/formato';
import type { RolCatalogo } from '../../core/modelos';

/**
 * §13 · Catalogo de roles: solo administra la etiqueta (clave + nombre) que
 * aparece en "Registrar usuario". Un rol nuevo aqui NO trae permisos ni
 * pantallas propias — eso sigue siendo codigo (@Roles(...) en el backend,
 * guardRol(...) en las rutas) y se programa aparte.
 */
@Component({
  selector: 'app-catalogo-roles',
  imports: [FormsModule],
  templateUrl: './catalogo-roles.html',
})
export class CatalogoRoles {
  private readonly api = inject(TicketsService);

  readonly roles = signal<RolCatalogo[]>([]);
  readonly error = signal('');

  readonly mostrarForm = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal('');

  rClave = '';
  rNombre = '';

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.api.roles().subscribe({
      next: (r) => this.roles.set(r),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrirNuevo() {
    this.editandoId.set(null);
    this.rClave = '';
    this.rNombre = '';
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  abrirEditar(r: RolCatalogo) {
    this.editandoId.set(r.id);
    this.rClave = r.clave;
    this.rNombre = r.nombre;
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  cancelar() {
    this.mostrarForm.set(false);
  }

  guardar() {
    if (this.rNombre.trim().length < 2) {
      this.errorForm.set('Captura el nombre.');
      return;
    }

    const id = this.editandoId();
    if (!id && this.rClave.trim().length < 2) {
      this.errorForm.set('Captura la clave.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');
    const peticion = id
      ? this.api.actualizarRol(id, { nombre: this.rNombre.trim() })
      : this.api.crearRol({ clave: this.rClave.trim(), nombre: this.rNombre.trim() });

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarForm.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.errorForm.set(mensajeError(e));
      },
    });
  }

  /** Baja logica: activo=false lo oculta del selector de "Registrar usuario" sin borrarlo. */
  alternarActivo(r: RolCatalogo) {
    this.api.actualizarRol(r.id, { activo: !r.activo }).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
