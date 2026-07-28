import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import type ms from 'ms';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SUsuario, Usuario, UserSaf } from '../database/models';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    SequelizeModule.forFeature([Usuario]),
    SequelizeModule.forFeature([UserSaf, SUsuario], 'saf'),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET') ?? 'secreto_de_desarrollo',
        // jsonwebtoken tipa expiresIn como literal ('8h', '30m'...); del .env llega como string suelto.
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES') ?? '8h') as ms.StringValue },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
