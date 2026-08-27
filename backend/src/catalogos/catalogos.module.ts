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
  ServicioUsuarioPermitido,
  SUsuario,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Servicio,
      ServicioUsuarioPermitido,
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
    SequelizeModule.forFeature([SUsuario], 'saf'),
  ],
  controllers: [CatalogosController],
  providers: [CatalogosService],
})
export class CatalogosModule {}
