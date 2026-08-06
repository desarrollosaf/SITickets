import {
  Area,
  CatalogoProblema,
  Dependencia,
  Estatus,
  FolioSerie,
  MotivoReasignacion,
  Prioridad,
  Sede,
  Servicio,
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

/**
 * Modelos de la conexion principal. UserSaf queda fuera: vive en la conexion
 * secundaria 'saf' y se registra aparte en AppModule/AuthModule.
 */
export const MODELOS = [
  Dependencia,
  Sede,
  Area,
  Usuario,
  Servicio,
  TecnicoServicio,
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
