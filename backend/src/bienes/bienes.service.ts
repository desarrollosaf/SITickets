import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { SUsuario, Usuario } from '../database/models';
import type { UsuarioToken } from '../common/usuario-actual.decorator';

export interface Bien {
  inventario: string;
  descripcion: string | null;
  /**
   * id crudo del bien en SIASAF (campo `bien.id` de la API de CMP). Solo
   * viene poblado desde consultaCmp: es lo que pide la API de asignacion
   * temporal al tecnico. En el resto de servicios (API vieja) queda en null.
   */
  id: number | null;
  /** true si ahorita esta en mantenimiento (un tecnico lo trae): no se debe poder elegir. */
  en_mantenimiento: boolean;
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
 * API real de SIASAF para el servicio EQUIPO DE COMPUTO (CMP): consulta de
 * resguardo, movimiento de mantenimiento y ficha tecnica de un bien. Mismos
 * tres endpoints que usa el sistema anterior (TicketController::getBienes,
 * TicketTecnicoController::atenderTecnico/finalizarTecnico).
 */
const BASE_CMP_POR_OMISION = 'https://siasaf.gob.mx/bienes/api';

/** Tipo de bien = Equipo de computo (bien_muebles.tipo_bien_id / segmento de la URL de consulta). */
const TIPO_SERVICIO_CMP = 1;

/**
 * Catalogo `bienes.estatus_biens` (1=Asignado, 2=Mantenimiento, 3=Baja). Solo
 * se usa aqui para leer el estatus que ya trae la respuesta de SIASAF y
 * decidir `en_mantenimiento`; el movimiento en si (quien queda con el bien)
 * lo resuelve el propio SIASAF al recibir tipo_movimiento.
 */
const ESTATUS_MANTENIMIENTO = 2;

/**
 * Algunos servidores (visto en produccion con el IIS/Laravel de SIASAF)
 * responden distinto o rechazan la peticion cuando no hay User-Agent —
 * fetch(), a diferencia de curl, no manda uno por defecto.
 */
const USER_AGENT_CMP = 'SITickets-Backend/1.0';

/**
 * El balanceador de SIASAF a veces responde con una redireccion (301/302) en
 * la ruta de mantenimiento. fetch() la sigue sola por default y, por
 * compatibilidad historica del estandar, convierte POST en GET al seguirla
 * — eso hacia que Laravel recibiera un GET en una ruta que solo acepta POST,
 * con un error confuso ("GET method not supported"). Se usa solo en el POST
 * (postMantenimiento): en un GET seguir la redireccion es inofensivo, asi
 * que los otros metodos de consulta la siguen normal.
 */
const SIN_REDIRECCION = 'manual' as const;

/** Cuerpo de la respuesta (recortado) para que el log diga algo mas util que solo el codigo HTTP. */
async function errorDeRespuesta(respuesta: Response): Promise<Error> {
  if (respuesta.status >= 300 && respuesta.status < 400) {
    return new Error(`HTTP ${respuesta.status} (redireccion) a ${respuesta.headers.get('location')}`);
  }
  const detalle = await respuesta.text().catch(() => '');
  return new Error(`HTTP ${respuesta.status}${detalle ? `: ${detalle.slice(0, 300)}` : ''}`);
}

/**
 * El padron de bienes (servicio generico, no CMP) cambia por resguardos, no
 * por minuto. Cinco minutos de cache evitan una llamada a SIASAF cada vez
 * que alguien abre el formulario.
 */
const VIGENCIA_CACHE_MS = 5 * 60_000;

/**
 * Aqui el "rfc" son 10 caracteres sin homoclave (4 letras + 6 digitos), no el
 * RFC completo de 12-13: asi vienen users_safs.rfc y saf.s_usuario.N_Usuario
 * en este sistema (ver tambien el texto de ayuda en la pantalla de login).
 */
const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}$/;

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
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
  ) {}

  private baseCmp(): string {
    return this.config.get<string>('BIENES_API_BASE_URL', BASE_CMP_POR_OMISION).replace(/\/+$/, '');
  }

  private esperaMs(): number {
    return Number(this.config.get('BIENES_API_TIMEOUT_MS', 15000));
  }

  /**
   * rfc de la sesion. Si es un usuario local (staff, o solicitante ya
   * registrado) sale de ticketsv2.usuario; si es un solicitante externo
   * (usuario.externo, sin fila local) el id vive en el espacio de saf, asi
   * que se busca en saf.s_usuario en su lugar.
   */
  private async rfcDe(usuario: UsuarioToken): Promise<string | null> {
    if (!usuario.externo) {
      const local = await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] });
      return local?.rfc ?? null;
    }
    const sUsuario = await this.sUsuarios.findByPk(usuario.id);
    return sUsuario?.N_Usuario ?? null;
  }

  /**
   * Bienes bajo resguardo del usuario de la sesion. Nunca lanza: si el sistema
   * de bienes no responde, la pantalla debe poder seguir registrando el ticket
   * con captura manual en lugar de quedarse trabada.
   */
  async delUsuario(usuarioToken: UsuarioToken): Promise<RespuestaBienes> {
    const rfc = ((await this.rfcDe(usuarioToken)) ?? '').trim().toUpperCase();

    if (!rfc) {
      return {
        bienes: [],
        motivo: 'Tu cuenta no tiene RFC registrado, asi que no se pueden consultar tus resguardos.',
      };
    }
    if (!RE_RFC.test(rfc)) {
      this.log.warn(`RFC con formato invalido en el usuario ${usuarioToken.id}: no se consulta.`);
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

    const respuesta = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT_CMP,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(this.esperaMs()),
    });
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta);

    const cuerpo: unknown = await respuesta.json();
    const vistos = new Set<string>();
    const bienes: Bien[] = [];

    for (const fila of aLista(cuerpo)) {
      const inventario = primerTexto(fila, LLAVES_INVENTARIO);
      /* Sin numero de inventario el renglon no sirve: es lo que se guarda. */
      if (!inventario || vistos.has(inventario)) continue;
      vistos.add(inventario);
      bienes.push({
        inventario,
        descripcion: primerTexto(fila, LLAVES_DESCRIPCION),
        id: null,
        en_mantenimiento: false,
      });
    }
    return bienes;
  }

  /* ==================================================================
     Equipo de computo (CMP): API distinta, un solo equipo por ticket.
     ================================================================== */

  /** Bienes de EQUIPO DE COMPUTO del usuario de la sesion (alta del ticket). */
  async delUsuarioCmp(usuarioToken: UsuarioToken): Promise<RespuestaBienes> {
    const rfc = await this.rfcDe(usuarioToken);
    if (!rfc) {
      return {
        bienes: [],
        motivo: 'Tu cuenta no tiene RFC registrado, asi que no se puede consultar tu equipo.',
      };
    }
    return this.porRfcCmp(rfc);
  }

  /**
   * Bienes de EQUIPO DE COMPUTO de un rfc cualquiera. Se usa tanto para el
   * alta (rfc de la sesion) como para que el tecnico vea el equipo que
   * eligio el solicitante al atender el ticket (rfc del solicitante,
   * resuelto en TicketsService). Nunca lanza, mismo criterio que delUsuario.
   *
   * Sin cache: el estatus de mantenimiento tiene que verse al instante — un
   * cache de minutos haria que un equipo ya tomado por un tecnico se siguiera
   * viendo disponible.
   */
  async porRfcCmp(rfcCrudo: string | null | undefined): Promise<RespuestaBienes> {
    const rfc = (rfcCrudo ?? '').trim().toUpperCase();
    if (!rfc) {
      return { bienes: [], motivo: 'No hay un RFC valido para consultar el equipo.' };
    }
    if (!RE_RFC.test(rfc)) {
      this.log.warn(`RFC con formato invalido: no se consulta (CMP).`);
      return { bienes: [], motivo: 'El RFC no tiene un formato valido.' };
    }

    try {
      const bienes = await this.consultaCmp(rfc);
      return { bienes, motivo: null };
    } catch (e) {
      const detalle = (e as Error).message;
      this.log.warn(`No se pudo consultar bienes CMP de ${rfc}: ${detalle}`);
      return {
        bienes: [],
        motivo: `El sistema de bienes no respondio (${detalle}). Captura el numero de inventario a mano.`,
      };
    }
  }

  /**
   * GET {base}/bienes/{rfc}/1 — mismo endpoint que usa TicketController::getBienes
   * (alta) y TicketTecnicoController (atender) en el sistema anterior. Cada
   * renglon trae el bien anidado y su estatus_bien_id actual; se incluyen
   * tanto los Asignados como los que estan en Mantenimiento con un tecnico,
   * para poder marcar en pantalla que ese equipo esta en atencion.
   */
  private async consultaCmp(rfc: string): Promise<Bien[]> {
    const url = `${this.baseCmp()}/bienes/${encodeURIComponent(rfc)}/${TIPO_SERVICIO_CMP}`;
    const respuesta = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT_CMP },
      signal: AbortSignal.timeout(this.esperaMs()),
    });
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta);

    const cuerpo = (await respuesta.json()) as { data?: unknown[] };
    const filas = Array.isArray(cuerpo?.data) ? cuerpo.data : [];

    const vistos = new Set<string>();
    const bienes: Bien[] = [];
    for (const filaRaw of filas) {
      const fila = filaRaw as {
        estatus_bien_id?: number;
        bien?: { id?: number; numero_inventario?: string; nombre_bien?: string };
      };
      const inventario = fila.bien?.numero_inventario?.trim();
      if (!inventario || vistos.has(inventario)) continue;
      vistos.add(inventario);
      bienes.push({
        inventario,
        descripcion: fila.bien?.nombre_bien?.trim() ?? null,
        id: fila.bien?.id ?? null,
        en_mantenimiento: fila.estatus_bien_id === ESTATUS_MANTENIMIENTO,
      });
    }
    return bienes;
  }

  /**
   * GET {base}/bienesinfo/{id} — ficha tecnica del bien para el dictamen de
   * baja (grupo/marca/modelo, ademas de lo que ya trae Bien). null si no se
   * pudo consultar; nunca lanza.
   */
  async detalleBien(bienId: number): Promise<{
    numero_inventario: string;
    nombre_bien: string;
    material: string | null;
    marca: string | null;
    modelo: string | null;
  } | null> {
    try {
      const url = `${this.baseCmp()}/bienesinfo/${bienId}`;
      const respuesta = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT_CMP },
        signal: AbortSignal.timeout(this.esperaMs()),
      });
      if (!respuesta.ok) throw await errorDeRespuesta(respuesta);

      const cuerpo = (await respuesta.json()) as {
        numero_inventario?: string;
        nombre_bien?: string;
        material?: string | null;
        marca?: string | null;
        modelo?: string | null;
      };
      if (!cuerpo?.numero_inventario) return null;

      return {
        numero_inventario: cuerpo.numero_inventario,
        nombre_bien: cuerpo.nombre_bien ?? '',
        material: cuerpo.material ?? null,
        marca: cuerpo.marca ?? null,
        modelo: cuerpo.modelo ?? null,
      };
    } catch (e) {
      this.log.warn(`No se pudo consultar la ficha tecnica del bien ${bienId}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * POST {base}/bienes/mantenimiento — unico endpoint para los dos
   * movimientos (toma/regreso). El balanceador de SIASAF manda de vez en
   * cuando una redireccion "a si mismo" (ver SIN_REDIRECCION), de forma
   * intermitente — un reintento casi siempre la resuelve, asi que solo en
   * ese caso se reintenta un par de veces antes de darse por vencido.
   */
  private async postMantenimiento(cuerpo: Record<string, unknown>): Promise<void> {
    const url = `${this.baseCmp()}/bienes/mantenimiento`;
    const intentos = 3;

    for (let intento = 1; intento <= intentos; intento++) {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT_CMP,
          /* Sin esto, los reintentos pueden reusar la misma conexion TCP
             (keep-alive) que ya esta "pegada" al nodo del balanceador que
             esta redirigiendo mal — Connection: close obliga a abrir una
             conexion nueva en cada intento, con chance de caer en otro nodo. */
          Connection: 'close',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.esperaMs()),
        redirect: SIN_REDIRECCION,
      });
      if (respuesta.ok) return;

      const esRedireccion = respuesta.status >= 300 && respuesta.status < 400;
      if (!esRedireccion || intento === intentos) throw await errorDeRespuesta(respuesta);

      this.log.warn(
        `Redireccion intermitente de SIASAF en mantenimiento (intento ${intento}/${intentos}), reintentando...`,
      );
      /* Separado a proposito: si fuera un debounce anti-doble-envio del lado
         de SIASAF, reintentar de inmediato caeria en el mismo bloqueo. */
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  /**
   * Paso 1 de la atencion: el equipo entra a mantenimiento con el tecnico.
   * Mismo movimiento que TicketTecnicoController::update() en el sistema
   * anterior: tipo_movimiento = 0 (toma de custodia). Nunca lanza: si algo
   * falla, el ticket igual se finaliza en SITickets.
   */
  async iniciarMantenimiento(
    bienId: number,
    rfcTecnico: string,
  ): Promise<{ ok: boolean; motivo: string | null }> {
    const rfc = rfcTecnico.trim().toUpperCase();
    if (!RE_RFC.test(rfc)) {
      return { ok: false, motivo: 'El RFC del tecnico no tiene un formato valido.' };
    }

    try {
      await this.postMantenimiento({ rfc, tipo_movimiento: 0, bien_id: bienId });
      return { ok: true, motivo: null };
    } catch (e) {
      this.log.warn(`No se pudo iniciar mantenimiento del bien ${bienId} con ${rfc}: ${(e as Error).message}`);
      return {
        ok: false,
        motivo: 'No se pudo registrar en SIASAF que el equipo queda contigo. Avisa al área si hace falta.',
      };
    }
  }

  /**
   * Paso 2: cierra el mantenimiento. Mismo movimiento que
   * TicketTecnicoController::finalizarTecnico(): tipo_movimiento = 1
   * (regresa el bien). SIASAF decide del lado suyo a quien regresa la
   * custodia; aqui solo se manda el resultado:
   * - estado 0 = reparado, 1 = inservible (baja).
   * - baja siempre 0 — asi lo manda tambien el sistema anterior; el traspaso
   *   a "almacen" y el cierre formal de la baja los hace despues, aparte, el
   *   area de bienes con el dictamen como respaldo.
   * - observaciones solo se manda cuando el resultado es baja (el texto del
   *   dictamen).
   *
   * Nunca lanza: si algo falla, el ticket igual se finaliza en SITickets.
   */
  async finalizarMantenimiento(
    bienId: number,
    rfcTecnico: string,
    opciones: { reparado: boolean; observaciones?: string },
  ): Promise<{ ok: boolean; motivo: string | null }> {
    const rfc = rfcTecnico.trim().toUpperCase();
    if (!RE_RFC.test(rfc)) {
      return { ok: false, motivo: 'El RFC del tecnico no tiene un formato valido.' };
    }

    try {
      const cuerpo: Record<string, unknown> = {
        rfc,
        tipo_movimiento: 1,
        bien_id: bienId,
        baja: 0,
        estado: opciones.reparado ? 0 : 1,
      };
      if (!opciones.reparado) cuerpo.observaciones = opciones.observaciones ?? '';

      await this.postMantenimiento(cuerpo);
      return { ok: true, motivo: null };
    } catch (e) {
      this.log.warn(`No se pudo finalizar mantenimiento del bien ${bienId}: ${(e as Error).message}`);
      return {
        ok: false,
        motivo: 'No se pudo cerrar en SIASAF el registro de mantenimiento del equipo. Avisa al área si hace falta.',
      };
    }
  }
}
