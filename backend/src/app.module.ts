import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { MODELOS, SDependencia, SUsuario, UserSaf } from './database/models';
import { MigracionesModule } from './database/migraciones.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { BienesModule } from './bienes/bienes.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { TicketsModule } from './tickets/tickets.module';
import { OperacionModule } from './operacion/operacion.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    /* Tope general de peticiones. Las rutas de sesion aprietan mas el limite. */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),

    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'mysql' as const,
        host: config.get('DB_HOST', 'localhost'),
        port: Number(config.get('DB_PORT', 3306)),
        database: config.get('DB_NAME', 'mesa_ayuda'),
        username: config.get('DB_USER', 'mesa_app'),
        password: config.get('DB_PASS', ''),
        models: MODELOS,
        logging: false,
        timezone: '-06:00',
        define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
        /* Solo en desarrollo. En produccion el esquema se mueve con migraciones. */
        synchronize: config.get('DB_SYNC') === 'true',
        /* @nestjs/sequelize solo ejecuta sync() cuando esta activo. */
        autoLoadModels: true,
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),

    /*
     * Base externa 'saf': ahi vive el padron real de rfc/password que valida
     * el login. Solo lectura, no la gestiona este sistema.
     */
    SequelizeModule.forRootAsync({
      name: 'saf',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'mysql' as const,
        host: config.get('SAF_DB_HOST', 'localhost'),
        port: Number(config.get('SAF_DB_PORT', 3306)),
        database: config.get('SAF_DB_NAME', 'saf'),
        username: config.get('SAF_DB_USER', 'root'),
        password: config.get('SAF_DB_PASS', ''),
        models: [UserSaf, SUsuario, SDependencia],
        logging: false,
        timezone: '-06:00',
        synchronize: false,
        autoLoadModels: false,
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),

    /* Antes de SeedModule: el seed escribe sobre el esquema ya migrado. */
    MigracionesModule,

    AuthModule,
    BienesModule,
    CatalogosModule,
    TicketsModule,
    OperacionModule,
    SeedModule,
  ],
  providers: [
    /* Orden importa: primero autentica, luego verifica el rol. */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
