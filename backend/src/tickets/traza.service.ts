import { Injectable } from '@nestjs/common';

export interface LineaTraza {
  t: string;
  regla: string;
  texto: string;
}

/**
 * Traza del motor de reglas. Cada decision automatica deja una linea con la
 * seccion de la especificacion que la origina. Es lo que en el prototipo se
 * veia en la consola negra del pie de pantalla, y sirve para explicar por que
 * el sistema hizo lo que hizo sin tener que leer la bitacora ticket por ticket.
 *
 * Vive en memoria a proposito: es apoyo de operacion, no registro legal. El
 * registro que si debe conservarse es ticket_bitacora, que va en la base.
 */
@Injectable()
export class TrazaService {
  private readonly maximo = 400;
  private lineas: LineaTraza[] = [];

  registra(regla: string, texto: string): void {
    this.lineas.unshift({ t: new Date().toISOString(), regla, texto });
    if (this.lineas.length > this.maximo) this.lineas.length = this.maximo;
  }

  recientes(limite = 200): LineaTraza[] {
    return this.lineas.slice(0, limite);
  }
}
