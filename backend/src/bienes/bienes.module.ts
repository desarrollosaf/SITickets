import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BienMueble, ServidorBien, SUsuario, Usuario } from '../database/models';
import { BienesController } from './bienes.controller';
import { BienesService } from './bienes.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Usuario]),
    SequelizeModule.forFeature([SUsuario], 'saf'),
    SequelizeModule.forFeature([ServidorBien, BienMueble], 'bienes'),
  ],
  controllers: [BienesController],
  providers: [BienesService],
  exports: [BienesService],
})
export class BienesModule {}
