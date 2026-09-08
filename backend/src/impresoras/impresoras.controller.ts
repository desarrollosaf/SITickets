import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ImpresorasService } from './impresoras.service';
import { ApiKeyGuard } from '../common/api-key.guard';
import { Publico } from '../common/roles.decorator';
import type { CuerpoPythonCompara, CuerpoPythonNotificaError } from './dto/impresoras.dto';

@Controller()
export class ImpresorasController {
  constructor(private readonly impresoras: ImpresorasService) {}

  /**
   * Modelos de impresora registrados, para el select del formulario de alta
   * (servicio IMPRESORAS ARRENDADAS). Cualquier usuario con sesion — lo pide
   * el propio solicitante al registrar su ticket, no solo el personal.
   */
  @Get('impresoras/modelos')
  modelos() {
    return this.impresoras.modelos();
  }

  /**
   * Llamado por el script Python externo (no un usuario con sesion): mismos
   * nombres de ruta que el sistema viejo, para que solo haya que reapuntar
   * el host. Protegido por X-Api-Key, no por JWT — ver ApiKeyGuard.
   */
  @Publico()
  @UseGuards(ApiKeyGuard)
  @Post('pythonCompara')
  pythonCompara(@Body() body: CuerpoPythonCompara) {
    return this.impresoras.pythonCompara(body);
  }

  @Publico()
  @UseGuards(ApiKeyGuard)
  @Post('pythonNotificaError')
  pythonNotificaError(@Body() body: CuerpoPythonNotificaError) {
    return this.impresoras.pythonNotificaError(body);
  }
}
