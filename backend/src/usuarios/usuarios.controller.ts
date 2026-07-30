import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { Roles } from '../common/roles.decorator';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

/** §12 · alta de personal interno (tecnico/jefe/admin/proveedor). Solo el administrador. */
@Roles('admin')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get('saf')
  buscarSaf(@Query('q') q: string = '') {
    return this.usuarios.buscarSaf(q);
  }

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  registrar(@Body() dto: RegistrarUsuarioDto) {
    return this.usuarios.registrar(dto);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto) {
    return this.usuarios.actualizar(id, dto);
  }
}
