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
  InmuebleAdmin,
  LineaTraza,
  Monitor,
  NivelToner,
  Organizacion,
  Prioridad,
  Problema,
  ProblemaForm,
  ReporteDatos,
  RolCatalogo,
  Servicio,
  Tablero,
  Tecnico,
  TecnicoExterno,
  Ticket,
  TicketAtendidoCmp,
  TicketDetalle,
  TicketPorValidar,
  UsuarioPermitido,
} from './modelos';

export interface FiltrosTicket {
  servicio?: string;
  estatus?: string;
  prioridad?: string;
  tecnico?: string;
  interno?: string;
  abiertos?: string;
  /** Para tecnico/jefe/proveedor: solo lo que registraron ellos mismos, nunca lo que se les turno. */
  propios?: string;
  /** Para tecnico/jefe/proveedor: solo lo que les toca atender, nunca lo que registraron ellos mismos. */
  turnados?: string;
  /** Busca por folio vigente o por folio general (TK/DI/N), coincidencia parcial. */
  folio?: string;
  /** Para «Equipos dados de baja»: 'baja' trae solo los tickets CMP donde se dio de baja el equipo. */
  resultado_cmp?: string;
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

  /** Reporte en excel de todos los tickets segun los filtros (solo administrador). */
  reporteExcel(filtros: FiltrosTicket = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v) params = params.set(k, v);
    }
    return this.http.get(`${API}/tickets/reporte-excel`, { params, responseType: 'blob' });
  }

  /** Excel de «Equipos dados de baja» (solo administrador). */
  bajasExcel() {
    return this.http.get(`${API}/tickets/bajas-excel`, { responseType: 'blob' });
  }

  /** Datos agregados para las graficas del reporte, mismos filtros que reporteExcel(). */
  reporteDatos(filtros: FiltrosTicket = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v) params = params.set(k, v);
    }
    return this.http.get<ReporteDatos>(`${API}/tickets/reporte-datos`, { params });
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

  /** Bienes del solicitante para que el tecnico elija el inventario al retirar un equipo sin numero capturado. */
  bienesParaRetiro(id: number) {
    return this.http.get<BienesUsuario>(`${API}/tickets/${id}/bienes-para-retiro`);
  }

  /** Nivel de tóner de las impresoras arrendadas del ticket (solo servicio IMPA, no para el solicitante). */
  nivelToner(id: number) {
    return this.http.get<NivelToner>(`${API}/tickets/${id}/nivel-toner`);
  }

  /** Modelos de impresora registrados, para el select del campo «Modelo de impresora» (servicio IMPA). */
  modelosImpresora() {
    return this.http.get<string[]>(`${API}/impresoras/modelos`);
  }

  /* ---------------- alta ---------------- */

  crear(datos: {
    problema: string;
    contexto?: string;
    texto?: string;
    extension?: string;
    /** Libre y opcional, aplica a cualquier ticket sin importar el problema. */
    edificio_atencion?: string;
    /** Inmueble del catalogo elegido al registrar (ver `Catalogos.inmuebles`). */
    inmueble_id?: number;
    /** Piso u oficina dentro del inmueble elegido. */
    piso?: string;
    /** Solo servicio CNA: dia y hora (ISO) en que el tecnico puede ir a revisar los bienes. */
    hora_atencion?: string;
    /** Solo si el campo adicional es «Cuenta de correo»: no exige el dominio institucional. */
    correo_libre?: boolean;
    /** Solo si el problema es IMP-01 / IMPA-01 (solicitud de toner/cartucho). */
    color_toner?: string;
    /** Solo si el problema es IMPA-09 (traslado): que modelo se traslada. */
    modelo_traslado?: string;
    a_nombre_de?: number;
  }) {
    return this.http.post<TicketDetalle>(`${API}/tickets`, datos);
  }

  /** Solo el administrador: usuarios activos de saf para registrar a nombre de otro (§2). */
  /** Corrige a nombre de quien quedo el ticket. Sin aNombreDe = a nombre propio. */
  cambiarSolicitante(id: number, aNombreDe: number | null) {
    return this.http.post<TicketDetalle>(
      `${API}/tickets/${id}/solicitante`,
      aNombreDe ? { a_nombre_de: aNombreDe } : {},
    );
  }

  /** servicioId: en Cartas de no adeudo el backend incluye tambien a los dados de baja. */
  buscarSolicitantes(q: string, servicioId?: number | null) {
    return this.http.get<CandidatoSaf[]>(`${API}/tickets/solicitantes`, {
      params: servicioId ? { q, servicio: servicioId } : { q },
    });
  }

  /* ---------------- §16 validacion previa (rol validador) ---------------- */

  /** Bandeja del validador: tickets pendientes de sus dependencias asignadas. */
  porValidar() {
    return this.http.get<Ticket[]>(`${API}/tickets/por-validar`);
  }
  aprobarValidacion(id: number) {
    return this.http.post<{ id: number }>(`${API}/tickets/${id}/aprobar-validacion`, {});
  }
  rechazarValidacion(id: number, motivo: string) {
    return this.http.post<{ id: number }>(`${API}/tickets/${id}/rechazar-validacion`, { motivo });
  }
  /** Lo que el gestor registro y sigue (o quedo) en validacion. */
  misPorValidar() {
    return this.http.get<TicketPorValidar[]>(`${API}/tickets/mis-por-validar`);
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
    d: {
      contexto?: string;
      extension?: string;
      edificio_atencion?: string;
      inmueble_id?: number;
      piso?: string;
    },
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
  /** Admin/operador usaron "Copiar datos": queda grabado en el ticket, no solo en este navegador. */
  marcarCopiado(id: number) {
    return this.accion<void>(id, 'marcar-copiado');
  }
  /** `inventario` solo aplica al retirar un equipo (CMP) que no tenia numero capturado desde el registro. */
  espera(id: number, motivo: string, inventario?: string) {
    return this.accion(id, 'espera', { motivo, inventario });
  }
  reanudar(id: number) {
    return this.accion(id, 'reanudar');
  }
  resolver(
    id: number,
    d: {
      diagnostico?: string;
      solucion?: string;
      refacciones?: string;
      /** Solo servicio CNA (Cartas de no adeudo), en vez de diagnostico/solucion. */
      revision?: 'completa' | 'incompleta';
      observaciones?: string;
      /** Solo servicio IMPA (impresoras arrendadas): tecnico externo que atendio. */
      tecnico_externo_id?: number;
    },
  ) {
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
  /** Motivo opcional: solo en servicio CNA (Cartas de no adeudo) se puede omitir. */
  rechazar(id: number, motivo?: string) {
    return this.accion(id, 'rechazar', { motivo: motivo || undefined });
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
      permite_a_nombre_de: boolean;
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

  /* ---------------- catalogo de roles ---------------- */

  roles() {
    return this.http.get<RolCatalogo[]>(`${API}/catalogos/roles`);
  }
  crearRol(datos: { clave: string; nombre: string }) {
    return this.http.post<RolCatalogo>(`${API}/catalogos/roles`, datos);
  }
  actualizarRol(id: number, datos: Partial<{ nombre: string; activo: boolean }>) {
    return this.http.patch<RolCatalogo>(`${API}/catalogos/roles/${id}`, datos);
  }

  /* ---------------- catalogo de inmuebles ---------------- */

  inmueblesAdmin() {
    return this.http.get<InmuebleAdmin[]>(`${API}/catalogos/inmuebles/admin`);
  }
  crearInmueble(datos: { dependencia: string; ubicacion: string; propiedad: 'propio' | 'renta'; tipo: string }) {
    return this.http.post<InmuebleAdmin>(`${API}/catalogos/inmuebles`, datos);
  }
  actualizarInmueble(
    id: number,
    datos: Partial<{
      dependencia: string;
      ubicacion: string;
      propiedad: 'propio' | 'renta';
      tipo: string;
      activo: boolean;
    }>,
  ) {
    return this.http.patch<InmuebleAdmin>(`${API}/catalogos/inmuebles/${id}`, datos);
  }
  /** Captura/corrige las coordenadas (sede) del inmueble, para el geofencing del reloj (§16). */
  capturarSedeInmueble(id: number, datos: { latitud: number; longitud: number; radio_m?: number }) {
    return this.http.patch<InmuebleAdmin>(`${API}/catalogos/inmuebles/${id}/sede`, datos);
  }

  /* ---------------- catalogo de tecnicos externos (IMPA) ---------------- */

  tecnicosExternosAdmin() {
    return this.http.get<TecnicoExterno[]>(`${API}/catalogos/tecnicos-externos/admin`);
  }
  crearTecnicoExterno(datos: { nombre: string }) {
    return this.http.post<TecnicoExterno>(`${API}/catalogos/tecnicos-externos`, datos);
  }
  actualizarTecnicoExterno(id: number, datos: Partial<{ nombre: string; activo: boolean }>) {
    return this.http.patch<TecnicoExterno>(`${API}/catalogos/tecnicos-externos/${id}`, datos);
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
