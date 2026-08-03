import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { duracion, mensajeError } from '../../core/formato';
import type { Prioridad } from '../../core/modelos';

/** §4 · tiempos objetivo por prioridad. Cada opcion del catalogo trae una de estas fija. */
@Component({
  selector: 'app-prioridades',
  imports: [FormsModule],
  templateUrl: './prioridades.html',
})
export class Prioridades {
  private readonly api = inject(TicketsService);

  readonly dur = duracion;
  readonly prioridades = signal<Prioridad[]>([]);
  readonly error = signal('');

  readonly editando = signal<Prioridad | null>(null);
  readonly guardando = signal(false);
  readonly errorEdicion = signal('');

  editNombre = '';
  editMinRespuesta = 0;
  editMinResolucion = 0;

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.api.catalogos().subscribe({
      next: (c) => this.prioridades.set(c.prioridades),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrirEditar(p: Prioridad) {
    this.editando.set(p);
    this.editNombre = p.nombre;
    this.editMinRespuesta = p.minutos_respuesta;
    this.editMinResolucion = p.minutos_resolucion;
    this.errorEdicion.set('');
  }

  cerrarEdicion() {
    this.editando.set(null);
  }

  guardarEdicion() {
    const p = this.editando();
    if (!p) return;
    this.errorEdicion.set('');

    if (!this.editNombre.trim()) {
      this.errorEdicion.set('Captura el nombre.');
      return;
    }
    if (this.editMinRespuesta < 1 || this.editMinResolucion < 1) {
      this.errorEdicion.set('Los tiempos deben ser de al menos 1 minuto.');
      return;
    }

    this.guardando.set(true);
    this.api
      .actualizarPrioridad(p.clave, {
        nombre: this.editNombre.trim(),
        minutos_respuesta: this.editMinRespuesta,
        minutos_resolucion: this.editMinResolucion,
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.editando.set(null);
          this.cargar();
        },
        error: (e) => {
          this.guardando.set(false);
          this.errorEdicion.set(mensajeError(e));
        },
      });
  }
}
