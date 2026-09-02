import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ComparacionImpre, Impresora, Usuario } from '../database/models';
import { ImpresorasController } from './impresoras.controller';
import { ImpresorasService } from './impresoras.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Impresora, ComparacionImpre], 'eservice'),
    SequelizeModule.forFeature([Usuario]),
  ],
  controllers: [ImpresorasController],
  providers: [ImpresorasService],
  exports: [ImpresorasService],
})
export class ImpresorasModule {}
