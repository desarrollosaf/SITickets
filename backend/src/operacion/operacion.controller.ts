import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { CalendarioService } from './calendario.service';
import { TrazaService } from '../tickets/traza.service';
import { Roles } from '../common/roles.decorator';
import { CalendarioDto } from '../tickets/dto/tickets.dto';

@Controller()
export class OperacionController {
  constructor(
    private readonly monitorSrv: MonitorService,
    private readonly calendario: CalendarioService,
    private readonly traza: TrazaService,
  ) {}

  /** §17 · pantalla de turnos. La ve el area completa, no solo el admin. */
  @Roles('admin', 'jefe', 'tecnico', 'proveedor', 'operador')
  @Get('monitor')
  monitor() {
    return this.monitorSrv.monitor();
  }

  /** §13 · tablero de indicadores. */
  @Roles('admin', 'jefe', 'operador')
  @Get('tablero')
  async tablero() {
    const [rezago, desempeno, disponibilidad, compras] = await Promise.all([
      this.monitorSrv.rezago(),
      this.monitorSrv.desempeno(),
      this.monitorSrv.disponibilidad(),
      this.monitorSrv.compras(),
    ]);
    return { rezago, desempeno, disponibilidad, compras };
  }

  @Roles('admin', 'jefe')
  @Get('calendario')
  agenda() {
    return this.monitorSrv.agenda();
  }

  @Roles('admin')
  @HttpCode(200)
  @Post('calendario')
  alternar(@Body() dto: CalendarioDto) {
    return this.calendario.alternar(dto);
  }

  /** Traza del motor de reglas: explica por que el sistema decidio lo que decidio. */
  @Roles('admin', 'jefe')
  @Get('traza')
  trazaReciente() {
    return this.traza.recientes();
  }
}
