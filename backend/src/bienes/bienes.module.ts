import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SUsuario, Usuario } from '../database/models';
import { BienesController } from './bienes.controller';
import { BienesService } from './bienes.service';

@Module({
  imports: [SequelizeModule.forFeature([Usuario]), SequelizeModule.forFeature([SUsuario], 'saf')],
  controllers: [BienesController],
  providers: [BienesService],
  exports: [BienesService],
})
export class BienesModule {}
