import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../core/tickets.service';
import { mensajeError, NOMBRE_PRIORIDAD } from '../../core/formato';
import type { Problema, Servicio } from '../../core/modelos';

interface Grupo {
  servicio_id: number;
  servicio: string;
  origen: string;
  problemas: Problema[];
}

/** §2 · Es lo que ve el usuario en el segundo select. Administrable sin tocar código. */
@Component({
  selector: 'app-catalogo',
  imports: [FormsModule],
  templateUrl: './catalogo.html',
})
export class Catalogo {
  private readonly api = inject(TicketsService);

  readonly problemas = signal<Problema[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  readonly error = signal('');
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;
  readonly prioridades = ['P1', 'P2', 'P3', 'P4'];

  /** null = nada elegido todavia: no se muestra ningun catalogo. */
  readonly filtroServicioId = signal<number | null>(null);

  readonly grupos = computed<Grupo[]>(() => {
    const filtro = this.filtroServicioId();
    if (filtro === null) return [];

    const mapa = new Map<number, Grupo>();
    for (const p of this.problemas()) {
      if (p.servicio_id !== filtro) continue;
      if (!mapa.has(p.servicio_id)) {
        mapa.set(p.servicio_id, {
          servicio_id: p.servicio_id,
          servicio: p.servicio,
          origen: p.origen,
          problemas: [],
        });
      }
      mapa.get(p.servicio_id)!.problemas.push(p);
    }
    return [...mapa.values()].sort((a, b) => a.servicio.localeCompare(b.servicio));
  });

  readonly mostrarForm = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal('');

  servicioId: number | null = null;
  clave = '';
  descripcion = '';
  prioridad = 'P4';
  campoAdicional = '';
  requiereTexto = false;
  orden = 0;

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.api.problemasAdmin().subscribe({
      next: (p) => this.problemas.set(p),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.api.catalogos().subscribe({
      next: (c) => this.servicios.set(c.servicios),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrirNuevo(servicioId?: number) {
    this.editandoId.set(null);
    this.servicioId = servicioId ?? null;
    this.clave = '';
    this.descripcion = '';
    this.prioridad = 'P4';
    this.campoAdicional = '';
    this.requiereTexto = false;
    this.orden = 0;
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  abrirEditar(p: Problema) {
    this.editandoId.set(p.id);
    this.servicioId = p.servicio_id;
    this.clave = p.clave;
    this.descripcion = p.descripcion;
    this.prioridad = p.prioridad;
    this.campoAdicional = p.campo_adicional ?? '';
    this.requiereTexto = p.requiere_texto;
    this.orden = p.orden ?? 0;
    this.errorForm.set('');
    this.mostrarForm.set(true);
  }

  cancelar() {
    this.mostrarForm.set(false);
  }

  guardar() {
    if (!this.servicioId) {
      this.errorForm.set('Elige el tipo de servicio.');
      return;
    }
    if (this.clave.trim().length < 2 || this.descripcion.trim().length < 3) {
      this.errorForm.set('Captura clave y descripción.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');
    const datos = {
      servicio_id: this.servicioId,
      clave: this.clave.trim(),
      descripcion: this.descripcion.trim(),
      prioridad: this.prioridad,
      campo_adicional: this.campoAdicional.trim() || undefined,
      requiere_texto: this.requiereTexto,
      orden: this.orden,
    };

    const id = this.editandoId();
    const peticion = id ? this.api.actualizarProblema(id, datos) : this.api.crearProblema(datos);

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

  /** Baja logica: activo=false la retira del formulario de tickets sin borrar el registro. */
  alternarActivo(p: Problema) {
    this.api.actualizarProblema(p.id, { activo: !p.activo }).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
