import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CatalogosService } from './catalogos.service';
import { Publico, Roles } from '../common/roles.decorator';
import { ActualizarProblemaDto, CrearProblemaDto } from './dto/catalogo-problema.dto';

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
  todo() {
    return this.catalogos.todo();
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

  @Roles('admin')
  @Patch('problemas/:id')
  actualizarProblema(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProblemaDto) {
    return this.catalogos.actualizarProblema(id, dto);
  }

  /** Padron de tecnicos: lo consulta el admin para reasignar. */
  @Roles('admin', 'jefe')
  @Get('tecnicos')
  tecnicos() {
    return this.catalogos.tecnicos();
  }
}
