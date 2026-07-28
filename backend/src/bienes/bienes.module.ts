import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Usuario } from '../database/models';
import { BienesController } from './bienes.controller';
import { BienesService } from './bienes.service';

@Module({
  imports: [SequelizeModule.forFeature([Usuario])],
  controllers: [BienesController],
  providers: [BienesService],
})
export class BienesModule {}
