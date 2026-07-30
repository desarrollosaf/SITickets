/* =====================================================================
   Contratos con el API. Espejo de lo que devuelve NestJS.
   ===================================================================== */

export type Rol = 'solicitante' | 'tecnico' | 'jefe' | 'admin' | 'proveedor';

export type EstatusClave =
  | 'REGISTRADO'
  | 'ASIGNADO'
  | 'EN_ATENCION'
  | 'EN_ESPERA'
  | 'RESUELTO'
  | 'CERRADO'
  | 'CANCELADO';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  correo: string | null;
  rol: Rol;
  extension: string | null;
  dependencia: string | null;
  area: string | null;
  dependencia_id: number | null;
  area_id: number | null;
}

export interface Sesion {
  token: string;
  usuario: UsuarioSesion;
}

export interface Ticket {
  id: number;
  folio: string;
  servicio_id: number;
  servicio: string;
  servicio_clave: string;
  servicio_original: string;
  problema_id: number | null;
  problema: string;
  problema_clave: string;
  prioridad: string;
  estatus: EstatusClave;
  contexto: string | null;
  solicitante_id: number;
  solicitante: string;
  dependencia: string;
  area: string;
  dependencia_id: number | null;
  area_id: number | null;
  extension: string | null;
  sede: string | null;
  tecnico_id: number | null;
  tecnico: string | null;
  interno: boolean;
  f_registro: string;
  en_cola: boolean;
  escalado: boolean;
  reclasificado: boolean;
  cierre_por_omision: boolean;
  reasignaciones: number;
  reaperturas: number;
  rechazos: number;
  sesiones: number;
  min_ciclo: number;
  min_activo: number;
  min_espera: number;
  minutos_objetivo: number;
  vencido: boolean;
}

export interface SesionReloj {
  id: number;
  inicio: string;
  fin: string | null;
  motivo: string | null;
  segundos: number;
  en_sitio: boolean | null;
  distancia_m: number | null;
  exactitud: number | null;
  sede_esperada: string | null;
  motivo_sin_ubicacion: string | null;
}

export interface LineaBitacora {
  id: number;
  fecha: string;
  accion: string;
  detalle: string | null;
  motivo: string | null;
  valor_antes: string | null;
  valor_nuevo: string | null;
  usuario: string;
}

export interface TicketDetalle extends Omit<Ticket, 'sesiones'> {
  sesiones: SesionReloj[];
  texto_libre: string | null;
  diagnostico: string | null;
  solucion: string | null;
  refacciones: string | null;
  motivo_espera: string | null;
  motivo_cancelacion: string | null;
  f_asignacion: string | null;
  f_inicio: string | null;
  f_resolucion: string | null;
  f_validacion: string | null;
  f_espera_desde: string | null;
  fecha_plan: string | null;
  campo_adicional: string | null;
  min_campo: number;
  equipo: { usuario_id: number; nombre: string; papel: 'responsable' | 'apoyo' }[];
  bitacora: LineaBitacora[];
}

export interface Problema {
  id: number;
  clave: string;
  descripcion: string;
  prioridad: string;
  campo_adicional: string | null;
  requiere_texto: boolean;
  servicio_id: number;
  servicio: string;
  servicio_clave: string;
  origen: 'usuario' | 'administrador';
  /** Solo viene en el listado de administracion; el publico solo trae activas. */
  orden?: number;
  activo?: boolean;
}

/** Cuerpo para crear o editar una opcion del catalogo de problemas. */
export interface ProblemaForm {
  servicio_id: number;
  clave: string;
  descripcion: string;
  prioridad: string;
  campo_adicional?: string;
  requiere_texto?: boolean;
  orden?: number;
  activo?: boolean;
}

export interface Servicio {
  id: number;
  clave: string;
  nombre: string;
  prefijo_folio: string;
  origen: 'usuario' | 'administrador';
  externo: boolean;
  multi_tecnico: boolean;
}

export interface Prioridad {
  clave: string;
  nombre: string;
  orden: number;
  minutos_respuesta: number;
  minutos_resolucion: number;
}

export interface EstatusCatalogo {
  clave: EstatusClave;
  nombre: string;
  orden: number;
  final: boolean;
}

export interface Catalogos {
  servicios: Servicio[];
  problemas: Problema[];
  prioridades: Prioridad[];
  estatus: EstatusCatalogo[];
  motivos: { id: number; nombre: string }[];
  sedes: { id: number; nombre: string; radio_m: number }[];
  /** Dominio institucional que exige el campo «Cuenta de correo». Lo fija el backend. */
  correo_dominio: string;
}

/** Bien bajo resguardo del usuario, tal como lo entrega el sistema de bienes. */
export interface Bien {
  inventario: string;
  descripcion: string | null;
}

export interface BienesUsuario {
  bienes: Bien[];
  /** Por que no hay lista: sin RFC, servicio caido… null si la consulta salio bien. */
  motivo: string | null;
}

export interface Tecnico {
  id: number;
  nombre: string;
  rol: Rol;
  servicios: { id: number; nombre: string; suplente: boolean }[];
}

export interface Organizacion {
  dependencias: { id: number; nombre: string }[];
  areas: { id: number; nombre: string; dependencia_id: number }[];
}

export interface Rezago {
  total: number;
  abiertos: number;
  fuera_de_tiempo: number;
  sin_asignar: number;
  en_espera: number;
  recibidos_hoy: number;
  cerrados_hoy: number;
  cierre_por_omision: number;
  por_prioridad: { prioridad: string; n: number; minutos_objetivo: number }[];
}

export interface Monitor {
  atencion: {
    id: number;
    folio: string;
    prioridad: string;
    estatus: EstatusClave;
    servicio: string;
    problema: string;
    tecnico: string;
    reloj_desde: string | null;
    seg_campo: number;
    motivo_espera: string | null;
    lat_inicio: number | null;
    lng_inicio: number | null;
    en_sitio: boolean | null;
    distancia_m: number | null;
  }[];
  cola: {
    turno: number;
    id: number;
    folio: string;
    prioridad: string;
    en_cola: boolean;
    servicio: string;
    dependencia: string;
    tecnico: string | null;
    min_espera: number;
  }[];
  rezago: Rezago;
}

export interface Desempeno {
  tecnico_id: number;
  tecnico: string;
  rol: Rol;
  especialidad: string;
  disponible: boolean;
  abiertos: number;
  atendidos: number;
  min_activo_prom: number | null;
  min_campo: number;
  pct_en_tiempo: number | null;
  reaperturas: number;
  sesiones: number;
  con_ubicacion: number;
  pct_en_sitio: number | null;
}

export interface Tablero {
  rezago: Rezago;
  desempeno: Desempeno[];
  disponibilidad: { servicio_id: number; servicio: string; tecnicos: number; disponibles: number }[];
  compras: {
    problemas: { clave: string; descripcion: string; servicio: string; tickets: number }[];
    dependencias: { dependencia: string; tickets: number }[];
  };
}

export interface Agenda {
  tecnicos: { id: number; nombre: string; especialidad: string }[];
  bloqueos: { usuario_id: number; fecha: string; tipo: string; nota: string | null }[];
}

export interface LineaTraza {
  t: string;
  regla: string;
  texto: string;
}

/** Lo que el navegador logro averiguar de la ubicacion. Nunca falla (§16). */
export interface Geo {
  lat?: number;
  lng?: number;
  exactitud?: number;
  motivo_sin_ubicacion?: string;
}
