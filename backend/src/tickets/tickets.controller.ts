import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { RelojService } from './reloj.service';
import { Roles } from '../common/roles.decorator';
import { UsuarioActual, type UsuarioToken } from '../common/usuario-actual.decorator';
import {
  CrearInternoDto,
  CrearTicketDto,
  DatosGeneralesDto,
  MotivoDto,
  PrioridadDto,
  ReasignarDto,
  ReclasificarDto,
  RelojFinDto,
  RelojInicioDto,
  ResolverDto,
} from './dto/tickets.dto';

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly reloj: RelojService,
  ) {}

  /** El listado ya viene acotado al rol; no hay parametro para ampliarlo. */
  @Get()
  listar(
    @UsuarioActual() usuario: UsuarioToken,
    @Query() filtros: Record<string, string | undefined>,
  ) {
    return this.tickets.listar(usuario, filtros);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.detalle(id, usuario);
  }

  @Roles('solicitante', 'admin')
  @Post()
  crear(@Body() dto: CrearTicketDto, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.crear(dto, usuario);
  }

  /**
   * Correccion de los datos generales. Quien puede hacerla —el solicitante del
   * ticket o el administrador— lo decide el servicio, que es donde consta de
   * quien es el reporte.
   */
  @HttpCode(200)
  @Post(':id/datos')
  datos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DatosGeneralesDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.actualizarDatos(id, dto, usuario);
  }

  @Roles('admin')
  @Post('internos')
  interno(@Body() dto: CrearInternoDto, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.crearInterno(dto, usuario);
  }

  /* ---------------- ciclo de vida ---------------- */

  @HttpCode(200)
  @Post(':id/iniciar')
  iniciar(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.iniciar(id, usuario);
  }

  @HttpCode(200)
  @Post(':id/espera')
  espera(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.ponerEnEspera(id, dto.motivo, usuario);
  }

  @HttpCode(200)
  @Post(':id/reanudar')
  reanudar(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.reanudar(id, usuario);
  }

  @HttpCode(200)
  @Post(':id/resolver')
  resolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolverDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.resolver(id, dto, usuario);
  }

  @HttpCode(200)
  @Post(':id/validar')
  validar(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.validar(id, usuario);
  }

  @Roles('solicitante')
  @HttpCode(200)
  @Post(':id/rechazar')
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.rechazar(id, dto.motivo, usuario);
  }

  @Roles('solicitante', 'admin')
  @HttpCode(200)
  @Post(':id/reabrir')
  reabrir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.reabrir(id, dto.motivo, usuario);
  }

  @HttpCode(200)
  @Post(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.cancelar(id, dto.motivo, usuario);
  }

  @Roles('admin')
  @HttpCode(200)
  @Post(':id/reasignar')
  reasignar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasignarDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.reasignar(id, dto, usuario);
  }

  /** El tecnico tambien puede: detecta el error de clasificacion en sitio. */
  @Roles('admin', 'tecnico', 'jefe', 'proveedor')
  @HttpCode(200)
  @Post(':id/reclasificar')
  reclasificar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReclasificarDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.reclasificar(id, dto, usuario);
  }

  @Roles('admin')
  @HttpCode(200)
  @Post(':id/prioridad')
  prioridad(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrioridadDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.cambiarPrioridad(id, dto, usuario);
  }

  /* ---------------- §16 reloj checador ---------------- */

  @Roles('tecnico', 'jefe', 'proveedor', 'admin')
  @HttpCode(200)
  @Post(':id/reloj/inicio')
  relojInicio(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RelojInicioDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.reloj.iniciar(id, dto, usuario);
  }

  @Roles('tecnico', 'jefe', 'proveedor', 'admin')
  @HttpCode(200)
  @Post(':id/reloj/fin')
  relojFin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RelojFinDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.reloj.detener(id, dto, usuario);
  }
}
