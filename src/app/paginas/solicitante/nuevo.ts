import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TicketsService } from '../../core/tickets.service';
import { duracion, mensajeError, NOMBRE_PRIORIDAD } from '../../core/formato';
import type { Catalogos, Problema } from '../../core/modelos';

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

  contexto = '';
  texto = '';
  extension = '';

  readonly dur = duracion;
  readonly nombrePrioridad = NOMBRE_PRIORIDAD;

  /** Solo los servicios que puede reportar un usuario (§3). */
  readonly servicios = computed(() =>
    (this.catalogos()?.servicios ?? []).filter((s) => s.origen === 'usuario'),
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
    this.contexto = '';
    this.texto = '';
  }

  guardar() {
    const p = this.problema();
    this.error.set('');

    if (!p) {
      this.error.set('Elige el tipo de servicio y el problema.');
      return;
    }
    if (p.campo_adicional && !this.contexto.trim()) {
      this.error.set(`Captura: ${p.campo_adicional}`);
      return;
    }
    if (p.requiere_texto && !this.texto.trim()) {
      this.error.set('Describe el problema.');
      return;
    }

    this.guardando.set(true);
    this.api
      .crear({
        problema: p.clave,
        contexto: this.contexto.trim() || undefined,
        texto: p.requiere_texto ? this.texto.trim() : undefined,
        extension: this.extension.trim() || undefined,
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
