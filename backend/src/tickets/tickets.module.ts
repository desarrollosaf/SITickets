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
  Sede,
  Servicio,
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

@Module({
  imports: [
    SequelizeModule.forFeature([
      Ticket,
      TicketTecnico,
      TicketSesion,
      TicketBitacora,
      CatalogoProblema,
      Servicio,
      Usuario,
      Area,
      Dependencia,
      Sede,
      TecnicoServicio,
      CalendarioTecnico,
      FolioSerie,
      Prioridad,
    ]),
    SequelizeModule.forFeature([SUsuario, SDependencia], 'saf'),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, RelojService, ReglasService, TrazaService],
  exports: [TicketsService, ReglasService, TrazaService, SequelizeModule],
})
export class TicketsModule {}
