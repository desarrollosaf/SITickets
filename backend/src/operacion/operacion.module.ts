import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  CalendarioTecnico,
  CatalogoProblema,
  Dependencia,
  ProgramaPreventivo,
  Servicio,
  TecnicoServicio,
  Ticket,
  TicketSesion,
  TicketTecnico,
  Usuario,
} from '../database/models';
import { MonitorService } from './monitor.service';
import { CalendarioService } from './calendario.service';
import { MantenimientoService } from './mantenimiento.service';
import { OperacionController } from './operacion.controller';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TicketsModule,
    SequelizeModule.forFeature([
      Ticket,
      TicketSesion,
      TicketTecnico,
      Usuario,
      Servicio,
      TecnicoServicio,
      CalendarioTecnico,
      Dependencia,
      CatalogoProblema,
      ProgramaPreventivo,
    ]),
  ],
  controllers: [OperacionController],
  providers: [MonitorService, CalendarioService, MantenimientoService],
})
export class OperacionModule {}
