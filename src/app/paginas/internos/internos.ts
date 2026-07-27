import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import { TablaTickets } from '../../comp/tabla-tickets';
import { DetalleTicket } from '../../comp/detalle-ticket';
import { iso, mensajeError } from '../../core/formato';
import type { Catalogos, Tecnico, Ticket } from '../../core/modelos';

/**
 * §11 · Trabajo que nadie solicita pero debe hacerse. Admite varios técnicos y
 * el jefe de departamento queda como responsable; no requiere validación de
 * usuario porque no hay usuario que valide.
 */
@Component({
  selector: 'app-internos',
  imports: [FormsModule, TablaTickets, DetalleTicket],
  templateUrl: './internos.html',
})
export class Internos {
  private readonly api = inject(TicketsService);
  readonly auth = inject(AuthService);

  readonly tickets = signal<Ticket[]>([]);
  readonly catalogos = signal<Catalogos | null>(null);
  readonly tecnicos = signal<Tecnico[]>([]);
  readonly abierto = signal<number | null>(null);
  readonly error = signal('');

  readonly formulario = signal(false);
  readonly servicioId = signal<number | null>(null);
  readonly seleccionados = signal<Set<number>>(new Set());
  claveProblema = '';
  alcance = '';
  fechaPlan = iso(new Date(Date.now() + 3 * 86_400_000));
  readonly errorForm = signal('');
  readonly guardando = signal(false);

  readonly esAdmin = computed(() => this.auth.rol() === 'admin');

  /** Servicios de origen administrador: cableado, inventarios, preventivo, configuración. */
  readonly serviciosInternos = computed(() =>
    (this.catalogos()?.servicios ?? []).filter((s) => s.origen === 'administrador'),
  );

  readonly actividades = computed(() =>
    (this.catalogos()?.problemas ?? []).filter(
      (p) => p.origen === 'administrador' && p.servicio_id === this.servicioId(),
    ),
  );

  /** Solo técnicos de campo: el jefe entra siempre como responsable. */
  readonly candidatos = computed(() => this.tecnicos().filter((t) => t.rol === 'tecnico'));

  constructor() {
    forkJoin({ catalogos: this.api.catalogos(), tecnicos: this.api.tecnicos() }).subscribe({
      next: (r) => {
        this.catalogos.set(r.catalogos);
        this.tecnicos.set(r.tecnicos);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.cargar();
  }

  cargar() {
    this.api.listar({ interno: 'true' }).subscribe({
      next: (t) => this.tickets.set(t),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrirFormulario() {
    this.servicioId.set(null);
    this.claveProblema = '';
    this.alcance = '';
    this.seleccionados.set(new Set());
    this.errorForm.set('');
    this.formulario.set(true);
  }

  cambiaServicio(valor: string) {
    this.servicioId.set(valor ? Number(valor) : null);
    this.claveProblema = '';
  }

  alternarTecnico(id: number) {
    this.seleccionados.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  generar() {
    this.errorForm.set('');

    if (!this.claveProblema) {
      this.errorForm.set('Elige el tipo de trabajo y la actividad.');
      return;
    }
    if (!this.seleccionados().size) {
      this.errorForm.set('Selecciona al menos un técnico.');
      return;
    }

    this.guardando.set(true);
    this.api
      .crearInterno({
        problema: this.claveProblema,
        alcance: this.alcance.trim() || undefined,
        fecha_plan: this.fechaPlan || undefined,
        tecnicos: [...this.seleccionados()],
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.formulario.set(false);
          this.cargar();
        },
        error: (e) => {
          this.guardando.set(false);
          this.errorForm.set(mensajeError(e));
        },
      });
  }
}
