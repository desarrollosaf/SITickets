import { Controller, Get, NotFoundException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

const CARPETA = join(process.cwd(), 'assets', 'manuales');

/** Manuales en pdf que se enlazan desde el menu lateral segun el rol (ver shell.ts en el frontend). */
@Controller('manuales')
export class ManualesController {
  @Get('solicitante')
  solicitante() {
    return this.abrir('Guia del Solicitante - SITickets.pdf', 'guia-del-solicitante.pdf');
  }

  @Get('tecnico')
  tecnico() {
    return this.abrir('Manual de Usuario - SITickets.pdf', 'manual-de-usuario.pdf');
  }

  private abrir(archivo: string, nombreDescarga: string): StreamableFile {
    const ruta = join(CARPETA, archivo);
    if (!existsSync(ruta)) throw new NotFoundException('El manual no está disponible.');

    return new StreamableFile(createReadStream(ruta), {
      type: 'application/pdf',
      disposition: `inline; filename="${nombreDescarga}"`,
    });
  }
}
