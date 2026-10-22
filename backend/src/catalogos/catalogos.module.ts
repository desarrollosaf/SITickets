import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Area,
  CatalogoProblema,
  CatalogoRol,
  Estatus,
  Inmueble,
  MotivoReasignacion,
  Prioridad,
  Sede,
  Servicio,
  ServicioUsuarioPermitido,
  SDependencia,
  SUsuario,
  TecnicoExterno,
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
      Area,
      Sede,
      Inmueble,
      TecnicoExterno,
      Usuario,
      TecnicoServicio,
      CatalogoRol,
    ]),
    SequelizeModule.forFeature([SUsuario, SDependencia], 'saf'),
  ],
  controllers: [CatalogosController],
  providers: [CatalogosService],
})
export class CatalogosModule {}
