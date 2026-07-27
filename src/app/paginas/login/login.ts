import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/formato';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  correo = '';
  password = '';
  readonly error = signal('');
  readonly cargando = signal(false);

  entrar() {
    if (!this.correo || !this.password) {
      this.error.set('Captura tu correo y tu contraseña.');
      return;
    }
    this.cargando.set(true);
    this.error.set('');

    this.auth.login(this.correo, this.password).subscribe({
      next: (s) => {
        this.cargando.set(false);
        void this.router.navigate([this.auth.inicioDeRol(s.usuario.rol)]);
      },
      error: (e) => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}
