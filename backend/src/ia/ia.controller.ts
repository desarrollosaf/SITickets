import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RedaccionService } from './redaccion.service';
import { MejorarObservacionesDto } from './dto/mejorar-observaciones.dto';

@Controller('ia')
export class IaController {
  constructor(private readonly redaccion: RedaccionService) {}

  /** Mismos roles que pueden atender un ticket CMP: son quienes redactan el dictamen. */
  @Post('mejorar-observaciones')
  @Roles('tecnico', 'jefe', 'proveedor', 'admin')
  async mejorarObservaciones(@Body() dto: MejorarObservacionesDto) {
    const texto = await this.redaccion.mejorarObservaciones(dto.texto);
    return { texto };
  }
}
