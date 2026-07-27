import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Area,
  CatalogoProblema,
  Dependencia,
  Estatus,
  MotivoReasignacion,
  Prioridad,
  Sede,
  Servicio,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Servicio,
      CatalogoProblema,
      Prioridad,
      Estatus,
      MotivoReasignacion,
      Dependencia,
      Area,
      Sede,
      Usuario,
      TecnicoServicio,
    ]),
  ],
  controllers: [CatalogosController],
  providers: [CatalogosService],
})
export class CatalogosModule {}
