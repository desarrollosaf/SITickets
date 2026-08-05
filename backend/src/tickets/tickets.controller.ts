import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
import { AtenderCmpDto } from './dto/atender-cmp.dto';

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

  /**
   * Busqueda de usuarios activos de saf para que el administrador elija a
   * nombre de quien registra un ticket (§2). Va antes de ':id' para que no se
   * confunda "solicitantes" con un identificador de ticket.
   */
  @Roles('admin', 'operador', 'gestor')
  @Get('solicitantes')
  buscarSolicitantes(@Query('q') q: string = '', @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.buscarSolicitantes(q, usuario);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.detalle(id, usuario);
  }

  /** Equipo de computo asignado al solicitante (solo servicio CMP). */
  @Get(':id/bien')
  bienDelTicket(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.bienDelTicket(id, usuario);
  }

  @Roles('solicitante', 'admin', 'operador', 'gestor')
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

  /**
   * Cierre de tickets de Equipo de cómputo (CMP): reparado o dado de baja.
   * Si es baja, el sistema genera el dictamen en pdf; las fotos son solo
   * evidencia para el anexo fotografico del propio dictamen, por eso van a
   * memoria (no se guardan sueltas en disco).
   */
  @HttpCode(200)
  @Post(':id/atender-cmp')
  @UseInterceptors(
    FilesInterceptor('fotos', 12, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
          return cb(new BadRequestException('Las fotos deben ser JPG o PNG'), false);
        }
        cb(null, true);
      },
    }),
  )
  atenderCmp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtenderCmpDto,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    const archivos = (fotos ?? []).map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }));
    return this.tickets.atenderCmp(id, dto, archivos, usuario);
  }

  /** Descarga el dictamen de baja adjunto a un ticket CMP. */
  @Get(':id/dictamen')
  dictamen(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.tickets.dictamenDelTicket(id, usuario);
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

  @Roles('admin', 'operador')
  @HttpCode(200)
  @Post(':id/reasignar')
  reasignar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasignarDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.tickets.reasignar(id, dto, usuario);
  }

  @Roles('admin')
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
