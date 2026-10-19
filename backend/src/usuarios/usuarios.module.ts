import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Area,
  CatalogoRol,
  Dependencia,
  DependenciaValidador,
  SDependencia,
  Servicio,
  ServicioValidador,
  SUsuario,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Usuario,
      Dependencia,
      Area,
      Servicio,
      TecnicoServicio,
      CatalogoRol,
      DependenciaValidador,
      ServicioValidador,
    ]),
    SequelizeModule.forFeature([SUsuario, SDependencia], 'saf'),
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
