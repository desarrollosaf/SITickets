import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Area,
  Dependencia,
  SDependencia,
  Servicio,
  SUsuario,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Usuario, Dependencia, Area, Servicio, TecnicoServicio]),
    SequelizeModule.forFeature([SUsuario, SDependencia], 'saf'),
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
