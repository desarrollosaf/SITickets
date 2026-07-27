import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Area,
  CalendarioTecnico,
  CatalogoProblema,
  Dependencia,
  Estatus,
  MotivoReasignacion,
  Prioridad,
  ProgramaPreventivo,
  Sede,
  Servicio,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { SeedService } from './seed.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    SequelizeModule.forFeature([
      Prioridad,
      Estatus,
      MotivoReasignacion,
      Servicio,
      Dependencia,
      Sede,
      Area,
      Usuario,
      TecnicoServicio,
      CatalogoProblema,
      ProgramaPreventivo,
      CalendarioTecnico,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
