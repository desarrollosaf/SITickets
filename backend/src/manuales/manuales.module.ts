import { Module } from '@nestjs/common';
import { ManualesController } from './manuales.controller';

@Module({
  controllers: [ManualesController],
})
export class ManualesModule {}
