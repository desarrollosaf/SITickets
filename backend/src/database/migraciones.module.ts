import { Module } from '@nestjs/common';
import { MigracionesService } from './migraciones.service';

@Module({ providers: [MigracionesService] })
export class MigracionesModule {}
