import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/formato';
import type { Organizacion } from '../../core/modelos';

@Component({
  selector: 'app-registro',
  imports: [FormsModule, RouterLink],
  templateUrl: './registro.html',
})
export class Registro {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  nombre = '';
  correo = '';
  password = '';
  repetir = '';
  extension = '';

  readonly dependencia = signal<number | null>(null);
  readonly area = signal<number | null>(null);
  readonly organizacion = signal<Organizacion>({ dependencias: [], areas: [] });
  readonly error = signal('');
  readonly cargando = signal(false);

  /** El area depende de la dependencia: no se ofrecen combinaciones invalidas. */
  readonly areas = computed(() =>
    this.organizacion().areas.filter((a) => a.dependencia_id === this.dependencia()),
  );

  constructor() {
    this.auth.organizacion().subscribe({
      next: (o) => this.organizacion.set(o),
      error: () => this.error.set('No se pudo cargar el catálogo de dependencias.'),
    });
  }

  cambiaDependencia(valor: string) {
    this.dependencia.set(valor ? Number(valor) : null);
    this.area.set(null);
  }

  crear() {
    this.error.set('');

    if (this.nombre.trim().length < 6) {
      this.error.set('Captura tu nombre completo.');
      return;
    }
    if (this.password !== this.repetir) {
      this.error.set('Las dos contraseñas no coinciden.');
      return;
    }
    if (!this.dependencia() || !this.area()) {
      this.error.set('Elige tu dependencia y tu área.');
      return;
    }

    this.cargando.set(true);
    this.auth
      .registrar({
        nombre: this.nombre,
        correo: this.correo,
        password: this.password,
        dependencia_id: this.dependencia()!,
        area_id: this.area()!,
        extension: this.extension || undefined,
      })
      .subscribe({
        next: () => {
          this.cargando.set(false);
          void this.router.navigate(['/nuevo']);
        },
        error: (e) => {
          this.cargando.set(false);
          this.error.set(mensajeError(e));
        },
      });
  }
}
