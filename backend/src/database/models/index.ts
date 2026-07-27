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

/** Orden importa: sequelize.sync crea las tablas en esta secuencia. */
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
