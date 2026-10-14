import { Injectable, signal } from '@angular/core';

const CLAVE = 'sit_tickets_copiados';

function cargar(): Set<number> {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? new Set(JSON.parse(crudo)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Recuerda que folios ya se copiaron con "Copiar datos" (detalle-ticket),
 * para pintar un indicador en la lista (tabla-tickets) y evitar copiar el
 * mismo ticket dos veces sin darse cuenta. Vive solo en sessionStorage: se
 * limpia al cerrar la pestaña/navegador.
 */
@Injectable({ providedIn: 'root' })
export class CopiadosService {
  private readonly ids = signal<Set<number>>(cargar());

  estaCopiado(id: number): boolean {
    return this.ids().has(id);
  }

  marcar(id: number) {
    const actual = new Set(this.ids());
    if (actual.has(id)) return;
    actual.add(id);
    this.ids.set(actual);
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify([...actual]));
    } catch {
      /* sessionStorage no disponible: el indicador solo vive en memoria. */
    }
  }
}
