import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes, Sequelize } from 'sequelize';
import { ComparacionImpre, Impresora, Usuario } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

/** rfc del unico caso puntual heredado del sistema viejo: solo el ve las impresoras de OSFEM. */
const RFC_SOLO_OSFEM = 'MAKH860429';

const COLORES_TONER = [
  'toner_porcent',
  'toner_negro_porcent',
  'toner_cian_porcent',
  'toner_magenta_porcent',
  'toner_amarillo_porcent',
] as const;

function numeroOCien(v: string | null | undefined): number {
  if (v === null || v === undefined || v.trim() === '') return 100;
  const n = Number(v);
  return Number.isFinite(n) ? n : 100;
}

function numeroONulo(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function colorPorPorcentaje(pct: number): 'red' | 'orange' | 'green' {
  if (pct < 20) return 'red';
  if (pct < 50) return 'orange';
  return 'green';
}

interface FilaCruda {
  impresora_id: number;
  edificio: string;
  dependencia: string;
  direccion: string | null;
  area: string;
  marca: string | null;
  modelo: string;
  serie: string;
  impresora_ip: string | null;
  lectura_id: number | null;
  lectura_ip: string | null;
  toner_porcent: string | null;
  toner_negro_porcent: string | null;
  toner_cian_porcent: string | null;
  toner_magenta_porcent: string | null;
  toner_amarillo_porcent: string | null;
  toner_residual_porcent: string | null;
  estado: string | null;
  fecha_hora: string | null;
}

export interface NivelTonerImpresora {
  id: number;
  edificio: string;
  dependencia: string;
  direccion: string | null;
  area: string;
  marca: string | null;
  modelo: string;
  serie: string;
  ip: string | null;
  toner: {
    porcent: number | null;
    negro: number | null;
    cian: number | null;
    magenta: number | null;
    amarillo: number | null;
    residual: number | null;
  };
  tonerMasBajo: number;
  colorEstado: 'red' | 'orange' | 'green';
  colorResidual: 'red' | 'orange' | 'green' | null;
  estado: string | null;
  fechaHora: string | null;
  sinLectura: boolean;
}

@Injectable()
export class ImpresorasService {
  private readonly log = new Logger('Impresoras');

  constructor(
    @InjectModel(Impresora, 'eservice') private readonly impresoras: typeof Impresora,
    @InjectModel(ComparacionImpre, 'eservice') private readonly lecturas: typeof ComparacionImpre,
    @InjectConnection('eservice') private readonly db: Sequelize,
    @InjectModel(Usuario) private readonly usuariosLocales: typeof Usuario,
  ) {}

  /* ==================================================================
     Ingestion: llamadas del script Python externo (ver ApiKeyGuard).
     ================================================================== */

  /**
   * El script manda un arreglo de lecturas (una por impresora que pudo
   * consultar por SNMP). Cada lectura es un INSERT nuevo, nunca un UPDATE:
   * el historico completo vive en comparacion_impre; la vigente es la de
   * mayor id por serie (ver nivelToner).
   */
  async pythonCompara(body: unknown): Promise<{ ok: true; insertadas: number; omitidas: number }> {
    const lista = this.extraeLecturas(body);
    let insertadas = 0;
    let omitidas = 0;

    for (const item of lista) {
      const serie = this.texto(item.serie);
      if (!serie) {
        omitidas++;
        continue;
      }
      await this.lecturas.create({
        serie,
        ip: this.texto(item.ip),
        total: this.texto(item.total),
        total_printer: this.texto(item.total_printer),
        total_copy: this.texto(item.total_copy),
        toner_porcent: this.texto(item.toner_porcent),
        toner_negro_porcent: this.texto(item.toner_negro_porcent),
        toner_residual_porcent: this.texto(item.toner_residual_porcent),
        toner_cian_porcent: this.texto(item.toner_cian_porcent),
        toner_magenta_porcent: this.texto(item.toner_magenta_porcent),
        toner_amarillo_porcent: this.texto(item.toner_amarillo_porcent),
        fecha_hora: this.texto(item.fecha_hora) ?? new Date().toISOString(),
        estado: this.texto(item.estado) ?? 'Actualizado',
        created_at: new Date(),
        updated_at: new Date(),
      });
      insertadas++;
    }

    this.log.log(`pythonCompara: ${insertadas} insertadas, ${omitidas} omitidas (sin serie).`);
    return { ok: true, insertadas, omitidas };
  }

  /** Marca la ultima lectura de una impresora (por serie o ip) como 'No actualizado'. */
  async pythonNotificaError(body: unknown): Promise<{ ok: boolean; motivo?: string }> {
    const b = (body ?? {}) as Record<string, unknown>;
    const serie = this.texto(b.serie);
    const ip = this.texto(b.ip);
    if (!serie && !ip) return { ok: false, motivo: 'Falta serie o ip' };

    const ultima = await this.lecturas.findOne({
      where: serie ? { serie } : { ip },
      order: [['id', 'DESC']],
    });
    if (!ultima) return { ok: false, motivo: 'No hay lecturas previas para esa impresora' };

    await ultima.update({ estado: 'No actualizado', updated_at: new Date() });
    this.log.log(`pythonNotificaError: ${serie ?? ip} marcada como No actualizado.`);
    return { ok: true };
  }

  private extraeLecturas(body: unknown): Record<string, unknown>[] {
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    const b = body as { lecturas?: unknown; data?: unknown } | null;
    if (Array.isArray(b?.lecturas)) return b.lecturas as Record<string, unknown>[];
    if (Array.isArray(b?.data)) return b.data as Record<string, unknown>[];
    return [];
  }

  private texto(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s || null;
  }

  /* ==================================================================
     Vista: nivel de tóner por impresora, para el detalle de un ticket
     de IMPRESORAS ARRENDADAS.
     ================================================================== */

  /**
   * areaNombreCompleto: nombre_completo de la direccion del solicitante del
   * ticket (saf.t_direccion), que es lo que eservice.impresoras.area usa
   * para identificar a que direccion pertenece cada impresora. Sin eso no
   * hay como saber cuales impresoras le tocan, asi que regresa vacio con un
   * motivo en vez de mostrar todas.
   */
  async nivelToner(
    areaNombreCompleto: string | null,
    usuario: UsuarioToken,
  ): Promise<{ impresoras: NivelTonerImpresora[]; motivo: string | null }> {
    if (!areaNombreCompleto) {
      return {
        impresoras: [],
        motivo: 'No se pudo identificar la dirección del solicitante en saf para cruzarla con el padrón de impresoras.',
      };
    }

    const soloOsfem = await this.esSoloOsfem(usuario);

    const filas = await this.db.query<FilaCruda>(
      `
      SELECT
        i.id AS impresora_id, i.edificio, i.dependencia, i.direccion, i.area, i.marca, i.modelo,
        i.serie, i.ip AS impresora_ip,
        ci.id AS lectura_id, ci.ip AS lectura_ip,
        ci.toner_porcent, ci.toner_negro_porcent, ci.toner_cian_porcent,
        ci.toner_magenta_porcent, ci.toner_amarillo_porcent, ci.toner_residual_porcent,
        ci.estado, ci.fecha_hora
      FROM impresoras i
      LEFT JOIN (
        SELECT c.*
        FROM comparacion_impre c
        INNER JOIN (
          SELECT serie, MAX(id) AS max_id
          FROM comparacion_impre
          WHERE deleted_at IS NULL AND serie IS NOT NULL
          GROUP BY serie
        ) u ON u.serie = c.serie AND u.max_id = c.id
      ) ci ON ci.serie = i.serie
      WHERE i.bactivo = 1 AND i.deleted_at IS NULL
        AND i.area = :area
        ${soloOsfem ? "AND i.dependencia = 'OSFEM'" : ''}
      `,
      { type: QueryTypes.SELECT, replacements: { area: areaNombreCompleto } },
    );

    if (!filas.length) {
      return {
        impresoras: [],
        motivo: `No hay impresoras registradas para «${areaNombreCompleto}».`,
      };
    }

    const mapeadas = filas.map((f): NivelTonerImpresora => {
      const valores = COLORES_TONER.map((c) => numeroOCien(f[c]));
      const tonerMasBajo = Math.min(...valores);
      const residual = numeroONulo(f.toner_residual_porcent);

      return {
        id: f.impresora_id,
        edificio: f.edificio,
        dependencia: f.dependencia,
        direccion: f.direccion,
        area: f.area,
        marca: f.marca,
        modelo: f.modelo,
        serie: f.serie,
        ip: f.lectura_ip ?? f.impresora_ip,
        toner: {
          porcent: numeroONulo(f.toner_porcent),
          negro: numeroONulo(f.toner_negro_porcent),
          cian: numeroONulo(f.toner_cian_porcent),
          magenta: numeroONulo(f.toner_magenta_porcent),
          amarillo: numeroONulo(f.toner_amarillo_porcent),
          residual,
        },
        tonerMasBajo,
        colorEstado: colorPorPorcentaje(tonerMasBajo),
        colorResidual: residual === null ? null : colorPorPorcentaje(residual),
        estado: f.estado,
        fechaHora: f.fecha_hora,
        sinLectura: f.lectura_id === null,
      };
    });

    /* No actualizado primero, luego sin lectura nunca, luego por tóner mas bajo. */
    const ordenadas = mapeadas.sort((a, b) => {
      const rango = (x: NivelTonerImpresora) => (x.estado === 'No actualizado' ? 0 : x.sinLectura ? 1 : 2);
      const r = rango(a) - rango(b);
      if (r !== 0) return r;
      return a.tonerMasBajo - b.tonerMasBajo;
    });

    return { impresoras: ordenadas, motivo: null };
  }

  /** Caso puntual heredado del sistema viejo: este rfc solo ve las impresoras de OSFEM. */
  private async esSoloOsfem(usuario: UsuarioToken): Promise<boolean> {
    if (usuario.externo) return false;
    const local = await this.usuariosLocales.findByPk(usuario.id, { attributes: ['rfc'] });
    return local?.rfc === RFC_SOLO_OSFEM;
  }
}
