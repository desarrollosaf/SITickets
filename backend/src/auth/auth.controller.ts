import { Body, Controller, Get, Post, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CambiarPasswordDto, LoginDto } from './dto/auth.dto';
import { Publico } from '../common/roles.decorator';
import { UsuarioActual, type UsuarioToken } from '../common/usuario-actual.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Cinco intentos por minuto: frena el barrido de contrasenas. */
  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioToken) {
    return this.auth.perfil(usuario);
  }

  @HttpCode(200)
  @Post('password')
  password(@UsuarioActual() usuario: UsuarioToken, @Body() dto: CambiarPasswordDto) {
    return this.auth.cambiarPassword(usuario, dto);
  }
}
