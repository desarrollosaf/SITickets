import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { SUsuario, Usuario } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

export interface Bien {
  inventario: string;
  descripcion: string | null;

  /**
   * id crudo del bien en SIASAF (campo `bien.id` de la API de CMP). OJO: no
   * es un espacio de ids unico — un bien normal y un BNI pueden compartir el
   * mismo numero (son tablas distintas del lado de SIASAF), por eso siempre
   * hay que acompañarlo de `esBc` al usarlo contra otro endpoint.
   */
  id: number | null;

  /**
   * true si el bien viene del arreglo "bienesbc" (nomenclatura BNI, bienes
   * de bajo costo) en vez del arreglo "data" (bien normal). Determina que
   * variante de endpoint usar despues (bienesinfo/bienesinfobc, tipob 1/2).
   */
  esBc: boolean;

  /**
   * true si actualmente está en mantenimiento.
   */
  en_mantenimiento: boolean;
}

export interface RespuestaBienes {
  bienes: Bien[];
  motivo: string | null;
}

/**
 * Ruta del sistema genérico de bienes muebles.
 */
const URL_POR_OMISION =
  'https://siasaf.gob.mx/bienes/api/getbienes';

/**
 * API CMP.
 */
const BASE_CMP_POR_OMISION =
  'https://siasaf.gob.mx/bienes/api';

/**
 * Tipo de bien = Equipo de cómputo.
 */
const TIPO_SERVICIO_CMP = 1;

/**
 * Catalogo bienes.estatus_biens
 * 1 = Asignado
 * 2 = Mantenimiento
 * 3 = Baja
 */
const ESTATUS_MANTENIMIENTO = 2;

/**
 * Headers para SIASAF.
 */
const USER_AGENT_CMP = 'SITickets-Backend/1.0';
const SIN_COMPRESION = 'identity';

/**
 * No seguir redirects automáticamente.
 */
const SIN_REDIRECCION = 'manual' as const;

/**
 * Genera error descriptivo a partir de una respuesta HTTP.
 */
async function errorDeRespuesta(
  respuesta: Response,
): Promise<Error> {
  if (
    respuesta.status >= 300 &&
    respuesta.status < 400
  ) {
    const detalle = await respuesta
      .clone()
      .text()
      .catch(() => '');

    return new Error(
      `HTTP ${respuesta.status} (redireccion) a ` +
        `${respuesta.headers.get('location')}` +
        (detalle
          ? ` - ${detalle.slice(0, 300)}`
          : ''),
    );
  }

  const detalle = await respuesta
    .text()
    .catch(() => '');

  return new Error(
    `HTTP ${respuesta.status}` +
      (detalle
        ? `: ${detalle.slice(0, 300)}`
        : ''),
  );
}

/**
 * Cache de bienes genéricos.
 */
const VIGENCIA_CACHE_MS = 5 * 60_000;

/**
 * RFC sin homoclave.
 */
const RE_RFC =
  /^[A-ZÑ&]{3,4}\d{6}$/;

/**
 * Posibles nombres del inventario.
 */
const LLAVES_INVENTARIO = [
  'inventario',
  'no_inventario',
  'num_inventario',
  'numero_inventario',
  'no_inv',
  'clave',
];

const LLAVES_DESCRIPCION = [
  'descripcion',
  'descripcion_bien',
  'bien',
  'nombre',
  'articulo',
];

/**
 * Convierte diferentes formatos de respuesta en arreglo.
 */
function aLista(
  cuerpo: unknown,
): Record<string, unknown>[] {
  const esFila = (
    v: unknown,
  ): v is Record<string, unknown> =>
    typeof v === 'object' &&
    v !== null;

  if (Array.isArray(cuerpo)) {
    return cuerpo.filter(esFila);
  }

  if (esFila(cuerpo)) {
    for (const llave of [
      'bienes',
      'data',
      'items',
      'resultado',
      'result',
    ]) {
      const v = cuerpo[llave];

      if (Array.isArray(v)) {
        return v.filter(esFila);
      }
    }
  }

  return [];
}

/**
 * Obtiene el primer valor de texto válido.
 */
function primerTexto(
  fila: Record<string, unknown>,
  llaves: string[],
): string | null {
  for (const llave of llaves) {
    const v = fila[llave];

    if (
      typeof v === 'string' &&
      v.trim()
    ) {
      return v.trim();
    }

    if (typeof v === 'number') {
      return String(v);
    }
  }

  return null;
}

@Injectable()
export class BienesService {
  private readonly log =
    new Logger('Bienes');

  private readonly cache = new Map<
    string,
    {
      hasta: number;
      bienes: Bien[];
    }
  >();

  constructor(
    private readonly config: ConfigService,

    @InjectModel(Usuario)
    private readonly usuarios: typeof Usuario,

    @InjectModel(SUsuario, 'saf')
    private readonly sUsuarios: typeof SUsuario,
  ) {}

  private baseCmp(): string {
    return this.config
      .get<string>(
        'BIENES_API_BASE_URL',
        BASE_CMP_POR_OMISION,
      )
      .replace(/\/+$/, '');
  }

  private esperaMs(): number {
    return Number(
      this.config.get(
        'BIENES_API_TIMEOUT_MS',
        15000,
      ),
    );
  }

  /**
   * RFC del usuario.
   */
  private async rfcDe(
    usuario: UsuarioToken,
  ): Promise<string | null> {
    if (!usuario.externo) {
      const local =
        await this.usuarios.findByPk(
          usuario.id,
          {
            attributes: ['rfc'],
          },
        );

      return local?.rfc ?? null;
    }

    const sUsuario =
      await this.sUsuarios.findByPk(
        usuario.id,
      );

    return sUsuario?.N_Usuario ?? null;
  }

  /**
   * Consulta genérica de bienes del usuario de la sesion.
   */
  async delUsuario(
    usuarioToken: UsuarioToken,
  ): Promise<RespuestaBienes> {
    const rfc = (
      (await this.rfcDe(
        usuarioToken,
      )) ?? ''
    )
      .trim()
      .toUpperCase();

    if (!rfc) {
      return {
        bienes: [],
        motivo:
          'Tu cuenta no tiene RFC registrado, asi que no se pueden consultar tus resguardos.',
      };
    }

    return this.porRfc(rfc);
  }

  /**
   * Bienes (catalogo generico) de un usuario de saf cualquiera, dado su
   * id_Usuario. Se usa cuando admin/operador/gestor registran un ticket «a
   * nombre de otro»: ahi hay que consultar los resguardos de esa persona, no
   * los de quien esta armando el ticket. El controlador es quien restringe
   * esto a esos roles — aqui no se vuelve a validar.
   */
  async deSaf(idUsuarioSaf: number): Promise<RespuestaBienes> {
    const sUsuario = await this.sUsuarios.findByPk(idUsuarioSaf);
    if (!sUsuario?.N_Usuario) {
      return { bienes: [], motivo: 'Ese usuario no tiene RFC registrado en saf.' };
    }
    return this.porRfc(sUsuario.N_Usuario);
  }

  /** Igual que deSaf, pero para EQUIPO DE COMPUTO (otra API, ver porRfcCmp). */
  async deSafCmp(idUsuarioSaf: number): Promise<RespuestaBienes> {
    const sUsuario = await this.sUsuarios.findByPk(idUsuarioSaf);
    if (!sUsuario?.N_Usuario) {
      return { bienes: [], motivo: 'Ese usuario no tiene RFC registrado en saf.' };
    }
    return this.porRfcCmp(sUsuario.N_Usuario);
  }

  /** Nunca lanza: si el sistema de bienes no responde, la pantalla debe poder seguir con captura manual. */
  async porRfc(rfcCrudo: string): Promise<RespuestaBienes> {
    const rfc = rfcCrudo.trim().toUpperCase();

    if (!RE_RFC.test(rfc)) {
      this.log.warn(
        `RFC con formato invalido: no se consulta.`,
      );

      return {
        bienes: [],
        motivo:
          'El RFC no tiene un formato valido.',
      };
    }

    const enCache =
      this.cache.get(rfc);

    if (
      enCache &&
      enCache.hasta > Date.now()
    ) {
      return {
        bienes: enCache.bienes,
        motivo: null,
      };
    }

    const base =
      this.config
        .get<string>(
          'BIENES_API_URL',
          URL_POR_OMISION,
        )
        .trim();

    if (!base) {
      return {
        bienes: [],
        motivo:
          'La consulta al sistema de bienes no esta configurada.',
      };
    }

    try {
      const bienes =
        await this.consulta(
          base,
          rfc,
        );

      this.cache.set(rfc, {
        hasta:
          Date.now() +
          VIGENCIA_CACHE_MS,
        bienes,
      });

      return {
        bienes,
        motivo: null,
      };
    } catch (e) {
      this.log.warn(
        `No se pudo consultar bienes de ${rfc}: ${(e as Error).message}`,
      );

      return {
        bienes: [],
        motivo:
          'El sistema de bienes no respondio. Captura el numero de inventario a mano.',
      };
    }
  }

  private async consulta(
    base: string,
    rfc: string,
  ): Promise<Bien[]> {
    const url =
      `${base.replace(/\/+$/, '')}/` +
      `${encodeURIComponent(rfc)}`;

    const token =
      this.config.get<string>(
        'BIENES_API_TOKEN',
      );

    const respuesta =
      await fetch(url, {
        headers: {
          Accept:
            'application/json',
          'User-Agent':
            USER_AGENT_CMP,
          'Accept-Encoding':
            SIN_COMPRESION,

          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`,
              }
            : {}),
        },

        signal:
          AbortSignal.timeout(
            this.esperaMs(),
          ),
      });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(
        respuesta,
      );
    }

    const cuerpo: unknown =
      await respuesta.json();

    const vistos =
      new Set<string>();

    const bienes: Bien[] = [];

    for (const fila of aLista(cuerpo)) {
      const inventario =
        primerTexto(
          fila,
          LLAVES_INVENTARIO,
        );

      if (
        !inventario ||
        vistos.has(inventario)
      ) {
        continue;
      }

      vistos.add(inventario);

      bienes.push({
        inventario,

        descripcion:
          primerTexto(
            fila,
            LLAVES_DESCRIPCION,
          ),

        id: null,

        esBc: false,

        en_mantenimiento:
          false,
      });
    }

    return bienes;
  }

  /* ==========================================================
     EQUIPO DE COMPUTO / CMP
     ========================================================== */

  /**
   * Bienes CMP del usuario actual.
   */
  async delUsuarioCmp(
    usuarioToken: UsuarioToken,
  ): Promise<RespuestaBienes> {
    const rfc =
      await this.rfcDe(
        usuarioToken,
      );

    if (!rfc) {
      return {
        bienes: [],
        motivo:
          'Tu cuenta no tiene RFC registrado, asi que no se puede consultar tu equipo.',
      };
    }

    return this.porRfcCmp(rfc);
  }

  /**
   * Consulta CMP por RFC.
   */
  async porRfcCmp(
    rfcCrudo:
      | string
      | null
      | undefined,
  ): Promise<RespuestaBienes> {
    const rfc = (
      rfcCrudo ?? ''
    )
      .trim()
      .toUpperCase();

    if (!rfc) {
      return {
        bienes: [],
        motivo:
          'No hay un RFC valido para consultar el equipo.',
      };
    }

    if (!RE_RFC.test(rfc)) {
      this.log.warn(
        'RFC con formato invalido: no se consulta (CMP).',
      );

      return {
        bienes: [],
        motivo:
          'El RFC no tiene un formato valido.',
      };
    }

    try {
      const bienes =
        await this.consultaCmp(rfc);

      return {
        bienes,
        motivo: null,
      };
    } catch (e) {
      const detalle =
        (e as Error).message;

      this.log.warn(
        `No se pudo consultar bienes CMP de ${rfc}: ${detalle}`,
      );

      return {
        bienes: [],
        motivo:
          `El sistema de bienes no respondio (${detalle}). ` +
          `Captura el numero de inventario a mano.`,
      };
    }
  }

  /**
   * GET {base}/bienes/{rfc}/1
   */
  private async consultaCmp(
    rfc: string,
  ): Promise<Bien[]> {
    const url =
      `${this.baseCmp()}/bienes/` +
      `${encodeURIComponent(rfc)}/` +
      `${TIPO_SERVICIO_CMP}`;

    const respuesta =
      await fetch(url, {
        headers: {
          Accept:
            'application/json',

          'User-Agent':
            USER_AGENT_CMP,

          'Accept-Encoding':
            SIN_COMPRESION,
        },

        signal:
          AbortSignal.timeout(
            this.esperaMs(),
          ),
      });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(
        respuesta,
      );
    }

    const cuerpo =
      (await respuesta.json()) as {
        data?: unknown[];
        bienesbc?: unknown[];
      };

    /*
     * "bienesbc" son los bienes con nomenclatura BNI (otra categoria,
     * fuera del inventario normal "A..."): SIASAF los manda en un arreglo
     * aparte, con la misma forma salvo que la llave del renglon es
     * bien_mueble_b_c_id en vez de bien_mueble_id — el objeto "bien"
     * anidado (id/numero_inventario/nombre_bien) es igual en los dos, asi
     * que se procesan juntos con el mismo mapeo. Se marca `esBc` desde aqui
     * (el arreglo de donde salio cada renglon) porque `bien.id` por si solo
     * NO alcanza para saberlo: se traslapa con el id de un bien normal.
     */
    const filas = [
      ...(Array.isArray(cuerpo?.data) ? cuerpo.data : []).map((f) => ({ fila: f, esBc: false })),
      ...(Array.isArray(cuerpo?.bienesbc) ? cuerpo.bienesbc : []).map((f) => ({ fila: f, esBc: true })),
    ];

    const vistos =
      new Set<string>();

    const bienes: Bien[] = [];

    for (const { fila: filaRaw, esBc } of filas) {
      const fila =
        filaRaw as {
          estatus_bien_id?:
            number;

          bien?: {
            id?: number;

            numero_inventario?:
              string;

            nombre_bien?:
              string;
          };
        };

      const inventario =
        fila.bien
          ?.numero_inventario
          ?.trim();

      if (
        !inventario ||
        vistos.has(inventario)
      ) {
        continue;
      }

      vistos.add(inventario);

      bienes.push({
        inventario,

        descripcion:
          fila.bien
            ?.nombre_bien
            ?.trim() ?? null,

        id:
          fila.bien?.id ??
          null,

        esBc,

        en_mantenimiento:
          fila.estatus_bien_id ===
          ESTATUS_MANTENIMIENTO,
      });
    }

    return bienes;
  }

  /**
   * GET {base}/bienesinfo/{id} (bien normal) o {base}/bienesinfobc/{id}
   * (BNI) — el mismo `id` numerico existe en las dos tablas y NO refiere lo
   * mismo, asi que `esBc` es obligatorio para pegarle a la ruta correcta.
   */
  async detalleBien(
    bienId: number,
    esBc: boolean,
  ): Promise<{
    numero_inventario: string;
    nombre_bien: string;
    material: string | null;
    marca: string | null;
    modelo: string | null;
  } | null> {
    try {
      const url =
        `${this.baseCmp()}/` +
        `${esBc ? 'bienesinfobc' : 'bienesinfo'}/${bienId}`;

      const respuesta =
        await fetch(url, {
          headers: {
            Accept:
              'application/json',

            'User-Agent':
              USER_AGENT_CMP,

            'Accept-Encoding':
              SIN_COMPRESION,
          },

          signal:
            AbortSignal.timeout(
              this.esperaMs(),
            ),
        });

      if (!respuesta.ok) {
        throw await errorDeRespuesta(
          respuesta,
        );
      }

      const cuerpo =
        (await respuesta.json()) as {
          numero_inventario?:
            string;

          nombre_bien?:
            string;

          material?:
            string | null;

          marca?:
            string | null;

          modelo?:
            string | null;
        };

      if (
        !cuerpo
          ?.numero_inventario
      ) {
        return null;
      }

      return {
        numero_inventario:
          cuerpo.numero_inventario,

        nombre_bien:
          cuerpo.nombre_bien ??
          '',

        material:
          cuerpo.material ??
          null,

        marca:
          cuerpo.marca ?? null,

        modelo:
          cuerpo.modelo ??
          null,
      };
    } catch (e) {
      this.log.warn(
        `No se pudo consultar la ficha tecnica del bien ${bienId}: ${(e as Error).message}`,
      );

      return null;
    }
  }

  /**
   * POST mantenimiento.
   *
   * tipo_movimiento:
   * 0 = entra a mantenimiento
   * 1 = termina mantenimiento
   */
  private async postMantenimiento(
    cuerpo: Record<
      string,
      unknown
    >,
  ): Promise<void> {
    const url =
      `${this.baseCmp()}/bienes/mantenimiento`;

    const intentos = 5;

    for (
      let intento = 1;
      intento <= intentos;
      intento++
    ) {
      this.log.warn(
        `[SIASAF REQUEST] ` +
          `intento=${intento}/${intentos} ` +
          `url=${url} ` +
          `body=${JSON.stringify(cuerpo)}`,
      );

      const inicio =
        Date.now();

      const respuesta =
        await fetch(url, {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json',

            'User-Agent':
              USER_AGENT_CMP,

            'Accept-Encoding':
              SIN_COMPRESION,

            Connection:
              'close',
          },

          body:
            JSON.stringify(
              cuerpo,
            ),

          signal:
            AbortSignal.timeout(
              this.esperaMs(),
            ),

          redirect:
            SIN_REDIRECCION,
        });

      const bodyRespuesta =
        await respuesta
          .clone()
          .text()
          .catch(() => '');

      this.log.warn(
        `[SIASAF RESPONSE] ` +
          `intento=${intento}/${intentos} ` +
          `tiempo=${Date.now() - inicio}ms ` +
          `status=${respuesta.status} ` +
          `url=${respuesta.url} ` +
          `location=${respuesta.headers.get('location')} ` +
          `server=${respuesta.headers.get('server')} ` +
          `contentType=${respuesta.headers.get('content-type')} ` +
          `body=${bodyRespuesta.slice(0, 1000)}`,
      );

      if (respuesta.ok) {
        return;
      }

      const esRedireccion =
        respuesta.status >= 300 &&
        respuesta.status < 400;

      if (
        !esRedireccion ||
        intento === intentos
      ) {
        throw await errorDeRespuesta(
          respuesta,
        );
      }

      this.log.warn(
        `Redireccion de SIASAF en mantenimiento ` +
          `(intento ${intento}/${intentos}), reintentando...`,
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            1500,
          ),
      );
    }
  }

  /**
   * PASO 1
   *
   * El técnico toma el equipo.
   * tipo_movimiento = 0
   */
  async iniciarMantenimiento(
    bienId: number,
    rfcTecnico: string,
    esBc: boolean,
  ): Promise<{
    ok: boolean;
    motivo: string | null;
  }> {
    const rfc =
      rfcTecnico
        .trim()
        .toUpperCase();

    if (!RE_RFC.test(rfc)) {
      return {
        ok: false,

        motivo:
          'El RFC del tecnico no tiene un formato valido.',
      };
    }

    try {
      await this.postMantenimiento(
        {
          rfc,

          tipo_movimiento:
            0,

          bien_id: bienId,

          /* 1 = bien normal, 2 = BNI (bajo costo) — el mismo bien_id existe
             en las dos tablas del lado de SIASAF, tipob es lo que le dice
             cual de las dos usar. */
          tipob: esBc ? 2 : 1,
        },
      );

      return {
        ok: true,
        motivo: null,
      };
    } catch (e) {
      this.log.warn(
        `No se pudo iniciar mantenimiento del bien ${bienId} con ${rfc}: ${(e as Error).message}`,
      );

      return {
        ok: false,

        motivo:
          'No se pudo registrar en SIASAF que el equipo queda contigo. Avisa al área si hace falta.',
      };
    }
  }

  /**
   * PASO 2
   *
   * Cierra mantenimiento.
   *
   * tipo_movimiento = 1
   *
   * estado:
   * 0 = reparado
   * 1 = inservible
   */
  async finalizarMantenimiento(
    bienId: number,
    rfcTecnico: string,
    esBc: boolean,
    opciones: {
      reparado: boolean;
      observaciones?: string;
    },
  ): Promise<{
    ok: boolean;
    motivo: string | null;
  }> {
    const rfc =
      rfcTecnico
        .trim()
        .toUpperCase();

    if (!RE_RFC.test(rfc)) {
      return {
        ok: false,

        motivo:
          'El RFC del tecnico no tiene un formato valido.',
      };
    }

    try {
      const cuerpo: Record<
        string,
        unknown
      > = {
        rfc,

        tipo_movimiento:
          1,

        bien_id:
          bienId,

        /* 1 = bien normal, 2 = BNI (bajo costo); ver iniciarMantenimiento. */
        tipob: esBc ? 2 : 1,

        baja: 0,

        estado:
          opciones.reparado
            ? 0
            : 1,
      };

      if (
        !opciones.reparado
      ) {
        cuerpo.observaciones =
          opciones
            .observaciones ??
          '';
      }

      await this.postMantenimiento(
        cuerpo,
      );

      return {
        ok: true,
        motivo: null,
      };
    } catch (e) {
      this.log.warn(
        `No se pudo finalizar mantenimiento del bien ${bienId}: ${(e as Error).message}`,
      );

      return {
        ok: false,

        motivo:
          'No se pudo cerrar en SIASAF el registro de mantenimiento del equipo. Avisa al área si hace falta.',
      };
    }
  }
}