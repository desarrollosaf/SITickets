import {
  Area,
  CatalogoProblema,
  CatalogoRol,
  Dependencia,
  DependenciaValidador,
  Estatus,
  FolioSerie,
  Inmueble,
  MotivoReasignacion,
  Prioridad,
  Sede,
  Servicio,
  ServicioUsuarioPermitido,
  ServicioValidador,
  TecnicoServicio,
  Usuario,
} from './catalogos.model';
import {
  CalendarioTecnico,
  ProgramaPreventivo,
  Ticket,
  TicketBitacora,
  TicketSesion,
  TicketTecnico,
} from './operacion.model';

export * from './catalogos.model';
export * from './operacion.model';
export * from './saf.model';
export * from './bienes.model';
export * from './eservice.model';

/**
 * Modelos de la conexion principal. UserSaf queda fuera: vive en la conexion
 * secundaria 'saf' y se registra aparte en AppModule/AuthModule.
 */
export const MODELOS = [
  Dependencia,
  Sede,
  Inmueble,
  Area,
  Usuario,
  CatalogoRol,
  Servicio,
  ServicioUsuarioPermitido,
  DependenciaValidador,
  TecnicoServicio,
  ServicioValidador,
  Prioridad,
  Estatus,
  CatalogoProblema,
  MotivoReasignacion,
  FolioSerie,
  Ticket,
  TicketTecnico,
  TicketSesion,
  TicketBitacora,
  CalendarioTecnico,
  ProgramaPreventivo,
];
