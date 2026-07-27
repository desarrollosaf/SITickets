import { Controller, Get, Query } from '@nestjs/common';
import { CatalogosService } from './catalogos.service';
import { Publico, Roles } from '../common/roles.decorator';

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

  /** Padron de tecnicos: lo consulta el admin para reasignar. */
  @Roles('admin', 'jefe')
  @Get('tecnicos')
  tecnicos() {
    return this.catalogos.tecnicos();
  }
}
