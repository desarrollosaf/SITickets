import { Controller, Get } from '@nestjs/common';
import { BienesService } from './bienes.service';
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
}
