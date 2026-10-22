import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, quitarAcentos } from '../../core/formato';
import type { TecnicoExterno } from '../../core/modelos';

/**
 * Catalogo de tecnicos externos (ej. IMPA: arrendadora de impresoras
 * Ricoh/Kyocera): no tienen cuenta en el sistema, solo se eligen aqui al
 * resolver un ticket de ese servicio para dejar registrado quien atendio.
 */
@Component({
  selector: 'app-catalogo-tecnicos-externos',
  imports: [FormsModule],
  templateUrl: './catalogo-tecnicos-externos.html',
})
export class CatalogoTecnicosExternos {
  private readonly api = inject(TicketsService);

  readonly tecnicos = signal<TecnicoExterno[]>([]);
  readonly error = signal('');

  busqueda = '';
  readonly filtrados = computed(() => {
    const texto = quitarAcentos(this.busqueda.trim().toLowerCase());
    const lista = this.tecnicos();
    if (!texto) return lista;
    return lista.filter((t) => quitarAcentos(t.nombre.toLowerCase()).includes(texto));
  });
  readonly activos = computed(() => this.tecnicos().filter((t) => t.activo).length);

  readonly mostrarForm = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal('');

  tNombre = '';

  constructor() {
    this.cargar();
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

  private cargar() {
    this.api.tecnicosExternosAdmin().subscribe({
      next: (r) => this.tecnicos.set(r),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrirNuevo() {
    this.editandoId.set(null);
    this.tNombre = '';
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  abrirEditar(t: TecnicoExterno) {
    this.editandoId.set(t.id);
    this.tNombre = t.nombre;
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  cancelar() {
    this.mostrarForm.set(false);
  }

  guardar() {
    if (this.tNombre.trim().length < 2) {
      this.errorForm.set('Captura el nombre del técnico.');
      return;
    }

    const id = this.editandoId();
    const datos = { nombre: this.tNombre.trim() };

    this.guardando.set(true);
    this.errorForm.set('');
    const peticion = id
      ? this.api.actualizarTecnicoExterno(id, datos)
      : this.api.crearTecnicoExterno(datos);

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

  /** Baja logica: activo=false lo oculta del selector al resolver, sin borrarlo. */
  alternarActivo(t: TecnicoExterno) {
    this.api.actualizarTecnicoExterno(t.id, { activo: !t.activo }).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
