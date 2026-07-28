import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Usuario } from '../database/models';

export interface Bien {
  inventario: string;
  descripcion: string | null;
}

export interface RespuestaBienes {
  bienes: Bien[];
  /**
   * Por que no hay lista. null cuando la consulta salio bien —aunque devuelva
   * cero bienes—. La pantalla lo usa para decidir si ofrece captura manual.
   */
  motivo: string | null;
}

/** Ruta del sistema de bienes muebles. Se le pega /{rfc} al consultar. */
const URL_POR_OMISION = 'https://siasaf.gob.mx/bienes/api/getbienes';

/**
 * El padron de bienes cambia por resguardos, no por minuto. Cinco minutos de
 * cache evitan una llamada a SIASAF cada vez que alguien abre el formulario.
 */
const VIGENCIA_CACHE_MS = 5 * 60_000;

const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Llaves con las que SIASAF podria nombrar cada dato. Se toma la primera que exista. */
const LLAVES_INVENTARIO = [
  'inventario',
  'no_inventario',
  'num_inventario',
  'numero_inventario',
  'no_inv',
  'clave',
];
const LLAVES_DESCRIPCION = ['descripcion', 'descripcion_bien', 'bien', 'nombre', 'articulo'];

/** La respuesta puede venir como arreglo suelto o envuelta en un objeto. */
function aLista(cuerpo: unknown): Record<string, unknown>[] {
  const esFila = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null;

  if (Array.isArray(cuerpo)) return cuerpo.filter(esFila);
  if (esFila(cuerpo)) {
    for (const llave of ['bienes', 'data', 'items', 'resultado', 'result']) {
      const v = cuerpo[llave];
      if (Array.isArray(v)) return v.filter(esFila);
    }
  }
  return [];
}

function primerTexto(fila: Record<string, unknown>, llaves: string[]): string | null {
  for (const llave of llaves) {
    const v = fila[llave];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

@Injectable()
export class BienesService {
  private readonly log = new Logger('Bienes');
  private readonly cache = new Map<string, { hasta: number; bienes: Bien[] }>();

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
  ) {}

  /**
   * Bienes bajo resguardo del usuario de la sesion. Nunca lanza: si el sistema
   * de bienes no responde, la pantalla debe poder seguir registrando el ticket
   * con captura manual en lugar de quedarse trabada.
   */
  async delUsuario(id: number): Promise<RespuestaBienes> {
    const usuario = await this.usuarios.findByPk(id, { attributes: ['id', 'rfc'] });
    const rfc = (usuario?.rfc ?? '').trim().toUpperCase();

    if (!rfc) {
      return {
        bienes: [],
        motivo: 'Tu cuenta no tiene RFC registrado, asi que no se pueden consultar tus resguardos.',
      };
    }
    if (!RE_RFC.test(rfc)) {
      this.log.warn(`RFC con formato invalido en el usuario ${id}: no se consulta.`);
      return { bienes: [], motivo: 'El RFC registrado en tu cuenta no tiene un formato valido.' };
    }

    const enCache = this.cache.get(rfc);
    if (enCache && enCache.hasta > Date.now()) return { bienes: enCache.bienes, motivo: null };

    const base = this.config.get<string>('BIENES_API_URL', URL_POR_OMISION).trim();
    if (!base) {
      return { bienes: [], motivo: 'La consulta al sistema de bienes no esta configurada.' };
    }

    try {
      const bienes = await this.consulta(base, rfc);
      this.cache.set(rfc, { hasta: Date.now() + VIGENCIA_CACHE_MS, bienes });
      return { bienes, motivo: null };
    } catch (e) {
      /* El detalle se queda en el log: al solicitante no le sirve de nada. */
      this.log.warn(`No se pudo consultar bienes de ${rfc}: ${(e as Error).message}`);
      return {
        bienes: [],
        motivo: 'El sistema de bienes no respondio. Captura el numero de inventario a mano.',
      };
    }
  }

  private async consulta(base: string, rfc: string): Promise<Bien[]> {
    const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(rfc)}`;
    const token = this.config.get<string>('BIENES_API_TOKEN');
    const espera = Number(this.config.get('BIENES_API_TIMEOUT_MS', 6000));

    const respuesta = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(espera),
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const cuerpo: unknown = await respuesta.json();
    const vistos = new Set<string>();
    const bienes: Bien[] = [];

    for (const fila of aLista(cuerpo)) {
      const inventario = primerTexto(fila, LLAVES_INVENTARIO);
      /* Sin numero de inventario el renglon no sirve: es lo que se guarda. */
      if (!inventario || vistos.has(inventario)) continue;
      vistos.add(inventario);
      bienes.push({ inventario, descripcion: primerTexto(fila, LLAVES_DESCRIPCION) });
    }
    return bienes;
  }
}
