import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { RedaccionService } from './redaccion.service';

@Module({
  controllers: [IaController],
  providers: [RedaccionService],
})
export class IaModule {}
