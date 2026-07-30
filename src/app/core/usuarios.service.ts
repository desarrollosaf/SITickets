import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API } from './api';
import type { ActualizarUsuarioForm, CandidatoSaf, RegistrarUsuarioForm, UsuarioStaff } from './modelos';

/** §12 · alta de personal interno. Solo lo usa el administrador. */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);

  buscarSaf(q: string) {
    return this.http.get<CandidatoSaf[]>(`${API}/usuarios/saf`, { params: { q } });
  }

  listar() {
    return this.http.get<UsuarioStaff[]>(`${API}/usuarios`);
  }

  registrar(datos: RegistrarUsuarioForm) {
    return this.http.post<{ id: number; rfc: string; nombre: string; rol: string }>(
      `${API}/usuarios`,
      datos,
    );
  }

  actualizar(id: number, datos: ActualizarUsuarioForm) {
    return this.http.patch<{ id: number }>(`${API}/usuarios/${id}`, datos);
  }
}
