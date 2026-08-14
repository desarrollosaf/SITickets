import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { BienesService } from './bienes.service';
import { Roles } from '../common/roles.decorator';
import { UsuarioActual } from '../common/usuario-actual.decorator';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

@Controller('bienes')
export class BienesController {
  constructor(private readonly bienes: BienesService) {}

  /**
   * Resguardos del usuario de la sesion. El RFC sale del token, nunca de la
   * peticion: si viniera del navegador, cualquiera podria pedir los bienes de
   * otro servidor publico.
   */
  @Get('mios')
  mios(@UsuarioActual() usuario: UsuarioToken) {
    return this.bienes.delUsuario(usuario);
  }

  /** Igual que /mios, pero para EQUIPO DE COMPUTO: un solo equipo, otra API. */
  @Get('mios-cmp')
  miosCmp(@UsuarioActual() usuario: UsuarioToken) {
    return this.bienes.delUsuarioCmp(usuario);
  }

  /**
   * Resguardos de un usuario de saf cualquiera (id_Usuario), para cuando
   * admin/operador/gestor registran un ticket «a nombre de otro»: ahi el
   * inventario a mostrar es el de esa persona, no el de quien esta armando
   * el ticket. Mismos roles que pueden usar a_nombre_de en POST /tickets.
   */
  @Roles('admin', 'operador', 'gestor')
  @Get('de/:idUsuarioSaf')
  deOtro(@Param('idUsuarioSaf', ParseIntPipe) idUsuarioSaf: number) {
    return this.bienes.deSaf(idUsuarioSaf);
  }

  /** Igual que /de/:idUsuarioSaf, pero para EQUIPO DE COMPUTO. */
  @Roles('admin', 'operador', 'gestor')
  @Get('de/:idUsuarioSaf/cmp')
  deOtroCmp(@Param('idUsuarioSaf', ParseIntPipe) idUsuarioSaf: number) {
    return this.bienes.deSafCmp(idUsuarioSaf);
  }
}
