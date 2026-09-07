import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ImpresorasService } from './impresoras.service';
import { ApiKeyGuard } from '../common/api-key.guard';
import { Publico } from '../common/roles.decorator';
import type { CuerpoPythonCompara, CuerpoPythonNotificaError } from './dto/impresoras.dto';

@Controller()
export class ImpresorasController {
  constructor(private readonly impresoras: ImpresorasService) {}

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
