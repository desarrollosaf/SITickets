import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CatalogosService } from './catalogos.service';
import { Publico, Roles } from '../common/roles.decorator';
import { UsuarioActual, type UsuarioToken } from '../common/usuario-actual.decorator';
import { ActualizarProblemaDto, CrearProblemaDto } from './dto/catalogo-problema.dto';
import { ActualizarPrioridadDto } from './dto/prioridad.dto';
import {
  ActualizarServicioDto,
  AgregarUsuarioPermitidoDto,
  CrearServicioDto,
} from './dto/servicio.dto';

@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  /**
   * Lo que necesita la pantalla de registro para armarse. Es publico porque el
   * formulario de alta de cuenta lo pide antes de que exista sesion, y no
   * revela nada sensible: son nombres de dependencias y areas.
   */
  @Publico()
  @Get('organizacion')
  organizacion() {
    return this.catalogos.organizacion();
  }

  /** Todo el catalogo operativo en una sola llamada. */
  @Get()
  todo(@UsuarioActual() usuario: UsuarioToken) {
    return this.catalogos.todo(usuario);
  }

  @Get('problemas')
  problemas(@Query('origen') origen?: 'usuario' | 'administrador') {
    return this.catalogos.problemas(origen);
  }

  /** Activas e inactivas, para el modulo de administracion del catalogo. */
  @Roles('admin')
  @Get('problemas/admin')
  problemasAdmin() {
    return this.catalogos.problemasAdmin();
  }

  @Roles('admin')
  @Post('problemas')
  crearProblema(@Body() dto: CrearProblemaDto) {
    return this.catalogos.crearProblema(dto);
  }

  /** Alta de un nuevo tipo de servicio (tabla servicio). */
  @Roles('admin')
  @Post('servicios')
  crearServicio(@Body() dto: CrearServicioDto) {
    return this.catalogos.crearServicio(dto);
  }

  @Roles('admin')
  @Patch('servicios/:id')
  actualizarServicio(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarServicioDto) {
    return this.catalogos.actualizarServicio(id, dto);
  }

  /** Lista de quien puede registrar tickets de un servicio con restringido=true. */
  @Roles('admin')
  @Get('servicios/:id/usuarios-permitidos')
  usuariosPermitidos(@Param('id', ParseIntPipe) id: number) {
    return this.catalogos.usuariosPermitidos(id);
  }

  @Roles('admin')
  @Post('servicios/:id/usuarios-permitidos')
  agregarUsuarioPermitido(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarUsuarioPermitidoDto,
  ) {
    return this.catalogos.agregarUsuarioPermitido(id, dto);
  }

  @Roles('admin')
  @Delete('servicios/:id/usuarios-permitidos/:permId')
  quitarUsuarioPermitido(
    @Param('id', ParseIntPipe) id: number,
    @Param('permId', ParseIntPipe) permId: number,
  ) {
    return this.catalogos.quitarUsuarioPermitido(id, permId);
  }

  @Roles('admin')
  @Patch('problemas/:id')
  actualizarProblema(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProblemaDto) {
    return this.catalogos.actualizarProblema(id, dto);
  }

  @Roles('admin')
  @Patch('prioridades/:clave')
  actualizarPrioridad(@Param('clave') clave: string, @Body() dto: ActualizarPrioridadDto) {
    return this.catalogos.actualizarPrioridad(clave, dto);
  }

  /** Padron de tecnicos: lo consulta el admin/operador para reasignar. */
  @Roles('admin', 'jefe', 'operador')
  @Get('tecnicos')
  tecnicos() {
    return this.catalogos.tecnicos();
  }
}
