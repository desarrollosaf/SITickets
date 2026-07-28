import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API } from './api';
import type {
  Agenda,
  BienesUsuario,
  Catalogos,
  Geo,
  LineaTraza,
  Monitor,
  Organizacion,
  Tablero,
  Tecnico,
  Ticket,
  TicketDetalle,
} from './modelos';

export interface FiltrosTicket {
  servicio?: string;
  estatus?: string;
  prioridad?: string;
  tecnico?: string;
  interno?: string;
  abiertos?: string;
}

@Injectable({ providedIn: 'root' })
export class TicketsService {
  private readonly http = inject(HttpClient);

  /* ---------------- consulta ---------------- */

  listar(filtros: FiltrosTicket = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v) params = params.set(k, v);
    }
    return this.http.get<Ticket[]>(`${API}/tickets`, { params });
  }

  detalle(id: number) {
    return this.http.get<TicketDetalle>(`${API}/tickets/${id}`);
  }

  /* ---------------- alta ---------------- */

  crear(datos: { problema: string; contexto?: string; texto?: string; extension?: string }) {
    return this.http.post<TicketDetalle>(`${API}/tickets`, datos);
  }

  crearInterno(datos: {
    problema: string;
    alcance?: string;
    fecha_plan?: string;
    tecnicos: number[];
  }) {
    return this.http.post<TicketDetalle>(`${API}/tickets/internos`, datos);
  }

  /**
   * Corrige los datos generales del reporte. El ticket en si —problema,
   * prioridad, tecnico— no se toca por aqui.
   */
  datos(
    id: number,
    d: { contexto?: string; extension?: string; dependencia?: number; area?: number | null },
  ) {
    return this.http.post<TicketDetalle>(`${API}/tickets/${id}/datos`, d);
  }

  /* ---------------- ciclo de vida ---------------- */

  private accion<T = TicketDetalle>(id: number, ruta: string, cuerpo: unknown = {}) {
    return this.http.post<T>(`${API}/tickets/${id}/${ruta}`, cuerpo);
  }

  iniciar(id: number) {
    return this.accion(id, 'iniciar');
  }
  espera(id: number, motivo: string) {
    return this.accion(id, 'espera', { motivo });
  }
  reanudar(id: number) {
    return this.accion(id, 'reanudar');
  }
  resolver(id: number, d: { diagnostico: string; solucion: string; refacciones?: string }) {
    return this.accion(id, 'resolver', d);
  }
  validar(id: number) {
    return this.accion(id, 'validar');
  }
  rechazar(id: number, motivo: string) {
    return this.accion(id, 'rechazar', { motivo });
  }
  reabrir(id: number, motivo: string) {
    return this.accion(id, 'reabrir', { motivo });
  }
  cancelar(id: number, motivo: string) {
    return this.accion(id, 'cancelar', { motivo });
  }
  reasignar(id: number, d: { tecnico: number; motivo: string; nota?: string }) {
    return this.accion(id, 'reasignar', d);
  }
  reclasificar(id: number, d: { problema: string; motivo: string }) {
    return this.accion(id, 'reclasificar', d);
  }
  prioridad(id: number, d: { prioridad: string; motivo: string }) {
    return this.accion(id, 'prioridad', d);
  }

  /* ---------------- §16 reloj checador ---------------- */

  relojInicio(id: number, geo: Geo) {
    return this.accion(id, 'reloj/inicio', geo);
  }
  relojFin(id: number, geo: Geo & { motivo?: string; en_espera?: boolean }) {
    return this.accion(id, 'reloj/fin', geo);
  }

  /* ---------------- catalogos y tableros ---------------- */

  catalogos() {
    return this.http.get<Catalogos>(`${API}/catalogos`);
  }
  organizacion() {
    return this.http.get<Organizacion>(`${API}/catalogos/organizacion`);
  }
  /** Resguardos del usuario de la sesion, para el campo «No. de inventario». */
  bienes() {
    return this.http.get<BienesUsuario>(`${API}/bienes/mios`);
  }
  tecnicos() {
    return this.http.get<Tecnico[]>(`${API}/catalogos/tecnicos`);
  }
  monitor() {
    return this.http.get<Monitor>(`${API}/monitor`);
  }
  tablero() {
    return this.http.get<Tablero>(`${API}/tablero`);
  }
  agenda() {
    return this.http.get<Agenda>(`${API}/calendario`);
  }
  alternarDia(d: { usuario: number; fecha: string; quitar?: boolean; tipo?: string; nota?: string }) {
    return this.http.post<{ bloqueado: boolean }>(`${API}/calendario`, d);
  }
  traza() {
    return this.http.get<LineaTraza[]>(`${API}/traza`);
  }
}
