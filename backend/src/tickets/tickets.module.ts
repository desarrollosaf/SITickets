import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Area,
  CalendarioTecnico,
  CatalogoProblema,
  Dependencia,
  FolioSerie,
  Prioridad,
  SDependencia,
  SDepartamento,
  SDireccion,
  Sede,
  Servicio,
  ServicioUsuarioPermitido,
  SUbicacion,
  SUbicacionDepartamento,
  SUsuario,
  TecnicoServicio,
  Ticket,
  TicketBitacora,
  TicketSesion,
  TicketTecnico,
  Usuario,
} from '../database/models';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { RelojService } from './reloj.service';
import { ReglasService } from './reglas.service';
import { TrazaService } from './traza.service';
import { DictamenService } from './dictamen.service';
import { CedulaCustodiaService } from './cedula-custodia.service';
import { BienesModule } from '../bienes/bienes.module';
import { ImpresorasModule } from '../impresoras/impresoras.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Ticket,
      TicketTecnico,
      TicketSesion,
      TicketBitacora,
      CatalogoProblema,
      Servicio,
      ServicioUsuarioPermitido,
      Usuario,
      Area,
      Dependencia,
      Sede,
      TecnicoServicio,
      CalendarioTecnico,
      FolioSerie,
      Prioridad,
    ]),
    SequelizeModule.forFeature(
      [SUsuario, SDependencia, SDireccion, SDepartamento, SUbicacion, SUbicacionDepartamento],
      'saf',
    ),
    BienesModule,
    ImpresorasModule,
  ],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    RelojService,
    ReglasService,
    TrazaService,
    DictamenService,
    CedulaCustodiaService,
  ],
  exports: [TicketsService, ReglasService, TrazaService, SequelizeModule],
})
export class TicketsModule {}
