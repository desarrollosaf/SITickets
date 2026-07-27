import { Body, Controller, Get, Post, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CambiarPasswordDto, LoginDto, RegistroDto } from './dto/auth.dto';
import { Publico } from '../common/roles.decorator';
import { UsuarioActual } from '../common/usuario-actual.decorator';

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

  @Publico()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('registro')
  registro(@Body() dto: RegistroDto) {
    return this.auth.registrar(dto);
  }

  @Get('yo')
  yo(@UsuarioActual('id') id: number) {
    return this.auth.perfil(id);
  }

  @HttpCode(200)
  @Post('password')
  password(@UsuarioActual('id') id: number, @Body() dto: CambiarPasswordDto) {
    return this.auth.cambiarPassword(id, dto);
  }
}
