import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API } from './api';
import type {
  Agenda,
  BienesUsuario,
  BienTicket,
  CandidatoSaf,
  Catalogos,
  Geo,
  LineaTraza,
  Monitor,
  NivelToner,
  Organizacion,
  Prioridad,
  Problema,
  ProblemaForm,
  Servicio,
  Tablero,
  Tecnico,
  Ticket,
  TicketAtendidoCmp,
  TicketDetalle,
  UsuarioPermitido,
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

  /** Equipo de computo elegido por el solicitante (solo servicio CMP). */
  bienDelTicket(id: number) {
    return this.http.get<BienTicket>(`${API}/tickets/${id}/bien`);
  }

  /** Bienes del solicitante para elegir al corregir el inventario (ticket en espera). */
  bienesParaCorregir(id: number) {
    return this.http.get<BienesUsuario>(`${API}/tickets/${id}/bienes-para-corregir`);
  }

  /** Nivel de tóner de las impresoras arrendadas del ticket (solo servicio IMPA, no para el solicitante). */
  nivelToner(id: number) {
    return this.http.get<NivelToner>(`${API}/tickets/${id}/nivel-toner`);
  }

  /* ---------------- alta ---------------- */

  crear(datos: {
    problema: string;
    contexto?: string;
    texto?: string;
    extension?: string;
    a_nombre_de?: number;
  }) {
    return this.http.post<TicketDetalle>(`${API}/tickets`, datos);
  }

  /** Solo el administrador: usuarios activos de saf para registrar a nombre de otro (§2). */
  buscarSolicitantes(q: string) {
    return this.http.get<CandidatoSaf[]>(`${API}/tickets/solicitantes`, { params: { q } });
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
  datos(id: number, d: { contexto?: string; extension?: string }) {
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

  /**
   * Cierre de tickets de Equipo de cómputo: reparado o dado de baja. En baja
   * el sistema genera el dictamen en pdf a partir de las observaciones y las
   * fotos son solo evidencia para su anexo fotográfico.
   */
  atenderCmp(
    id: number,
    d: {
      resultado: 'reparado' | 'baja';
      diagnostico?: string;
      solucion?: string;
      refacciones?: string;
      observaciones?: string;
      fotos?: File[];
    },
  ) {
    const form = new FormData();
    form.set('resultado', d.resultado);
    if (d.diagnostico) form.set('diagnostico', d.diagnostico);
    if (d.solucion) form.set('solucion', d.solucion);
    if (d.refacciones) form.set('refacciones', d.refacciones);
    if (d.observaciones) form.set('observaciones', d.observaciones);
    for (const foto of d.fotos ?? []) form.append('fotos', foto);
    return this.http.post<TicketAtendidoCmp>(`${API}/tickets/${id}/atender-cmp`, form);
  }

  /** Descarga el dictamen de baja adjunto a un ticket CMP. */
  descargarDictamen(id: number) {
    return this.http.get(`${API}/tickets/${id}/dictamen`, { responseType: 'blob' });
  }
  /** Descarga la cédula de salida (el técnico se llevó el equipo a revisar). */
  descargarCedulaSalida(id: number) {
    return this.http.get(`${API}/tickets/${id}/cedula-salida`, { responseType: 'blob' });
  }
  /** Descarga la cédula de entrada (el equipo regresó al solicitante). */
  descargarCedulaEntrada(id: number) {
    return this.http.get(`${API}/tickets/${id}/cedula-entrada`, { responseType: 'blob' });
  }

  /** Reescribe con IA la observación del técnico en formato técnico formal. */
  mejorarObservaciones(texto: string) {
    return this.http.post<{ texto: string }>(`${API}/ia/mejorar-observaciones`, { texto });
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
  /** Igual, pero para EQUIPO DE COMPUTO: un solo equipo, otra API. */
  bienesCmp() {
    return this.http.get<BienesUsuario>(`${API}/bienes/mios-cmp`);
  }
  /** Resguardos de otro usuario de saf (admin/operador/gestor, al registrar «a nombre de»). */
  bienesDe(idUsuarioSaf: number) {
    return this.http.get<BienesUsuario>(`${API}/bienes/de/${idUsuarioSaf}`);
  }
  bienesCmpDe(idUsuarioSaf: number) {
    return this.http.get<BienesUsuario>(`${API}/bienes/de/${idUsuarioSaf}/cmp`);
  }
  tecnicos() {
    return this.http.get<Tecnico[]>(`${API}/catalogos/tecnicos`);
  }

  /* ---------------- administracion del catalogo de problemas ---------------- */

  problemasAdmin() {
    return this.http.get<Problema[]>(`${API}/catalogos/problemas/admin`);
  }
  crearProblema(datos: ProblemaForm) {
    return this.http.post<Problema>(`${API}/catalogos/problemas`, datos);
  }
  actualizarProblema(id: number, datos: Partial<ProblemaForm>) {
    return this.http.patch<Problema>(`${API}/catalogos/problemas/${id}`, datos);
  }
  crearServicio(datos: {
    clave: string;
    nombre: string;
    prefijo_folio: string;
    origen: 'usuario' | 'administrador';
    externo?: boolean;
  }) {
    return this.http.post<Servicio>(`${API}/catalogos/servicios`, datos);
  }
  actualizarServicio(
    id: number,
    datos: Partial<{
      nombre: string;
      prefijo_folio: string;
      origen: 'usuario' | 'administrador';
      externo: boolean;
      restringido: boolean;
      activo: boolean;
    }>,
  ) {
    return this.http.patch<Servicio>(`${API}/catalogos/servicios/${id}`, datos);
  }
  /** Solo aplica a servicios con restringido=true: quien puede registrar tickets ahi. */
  usuariosPermitidos(servicioId: number) {
    return this.http.get<UsuarioPermitido[]>(
      `${API}/catalogos/servicios/${servicioId}/usuarios-permitidos`,
    );
  }
  agregarUsuarioPermitido(servicioId: number, idUsuarioSaf: number) {
    return this.http.post<UsuarioPermitido>(
      `${API}/catalogos/servicios/${servicioId}/usuarios-permitidos`,
      { id_usuario_saf: idUsuarioSaf },
    );
  }
  quitarUsuarioPermitido(servicioId: number, id: number) {
    return this.http.delete<{ ok: true }>(
      `${API}/catalogos/servicios/${servicioId}/usuarios-permitidos/${id}`,
    );
  }

  actualizarPrioridad(
    clave: string,
    datos: { nombre?: string; minutos_respuesta?: number; minutos_resolucion?: number },
  ) {
    return this.http.patch<Prioridad>(`${API}/catalogos/prioridades/${clave}`, datos);
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
