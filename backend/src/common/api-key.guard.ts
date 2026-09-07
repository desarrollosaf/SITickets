import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Protege rutas llamadas por scripts externos (no un usuario con sesion),
 * como el script Python que manda las lecturas de tóner. Va sobre rutas
 * marcadas @Publico() (para que JwtAuthGuard no exija un JWT) y exige en su
 * lugar el header X-Api-Key contra PYTHON_TONER_API_KEY.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const recibida = req.headers['x-api-key'];
    const esperada = this.config.get<string>('PYTHON_TONER_API_KEY');

    if (!esperada || recibida !== esperada) {
      throw new UnauthorizedException('Falta o es invalida la clave X-Api-Key');
    }
    return true;
  }
}
