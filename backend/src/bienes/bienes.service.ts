import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { BienMueble, EstatusBien, ServidorBien, SUsuario, Usuario } from '../database/models';
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
 * Catalogo `bienes.estatus_biens` (1=Asignado, 2=Mantenimiento, 3=Baja,
 * 4=Baja definitiva). Mismos valores y mismo flujo que usa el metodo real
 * `solicitudMantenimiento` del sistema de bienes (SIASAF): al entrar a
 * mantenimiento el resguardo activo y el del tecnico quedan ambos en
 * ESTATUS_MANTENIMIENTO; al cerrar, uno de los dos regresa a ESTATUS_ASIGNADO
 * (el original si se reparo, uno de los rfc de "almacen de bajas" si no) y el
 * otro pasa a ESTATUS_BAJA.
 */
const ESTATUS_ASIGNADO = 1;
const ESTATUS_MANTENIMIENTO = 2;
const ESTATUS_BAJA = 3;

/**
 * El padron de bienes cambia por resguardos, no por minuto. Cinco minutos de
 * cache evitan una llamada a SIASAF cada vez que alguien abre el formulario.
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
    @InjectModel(ServidorBien, 'bienes') private readonly servidorBienes: typeof ServidorBien,
    @InjectModel(BienMueble, 'bienes') private readonly bienMuebles: typeof BienMueble,
  ) {}

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
   * Sin cache (a diferencia de delUsuario/consulta, que si le pegan a una
   * API remota): esto consulta la base local `bienes`, y el estatus de
   * mantenimiento tiene que verse al instante — un cache de minutos haria
   * que un equipo ya tomado por un tecnico se siguiera viendo disponible.
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
      this.log.warn(`No se pudo consultar bienes CMP de ${rfc}: ${(e as Error).message}`);
      return {
        bienes: [],
        motivo: 'El sistema de bienes no respondio. Captura el numero de inventario a mano.',
      };
    }
  }

  /**
   * Consulta local, contra la base `bienes` (conexion secundaria, solo
   * lectura) — mismo dato que serviria la API remota de SIASAF
   * (bienes/api/bienes/{rfc}/1), pero sin salir a internet. Se usa asi para
   * no depender de la disponibilidad de esa API en desarrollo y para no
   * arriesgar datos reales de resguardo con pruebas contra el servidor real.
   *
   * Un mismo bien_mueble_id acumula un renglon por cada resguardo que ha
   * tenido a lo largo del tiempo (uno por rfc); solo el mas reciente queda
   * con estatus_bien_id = ESTATUS_ASIGNADO ("Asignado") o, si un tecnico lo
   * trae en este momento, ESTATUS_MANTENIMIENTO — los anteriores a esos dos
   * pasan a ESTATUS_BAJA. Sin filtrar por eso, un rfc que alguna vez tuvo el
   * equipo apareceria como si todavia lo tuviera. Se incluye tambien
   * Mantenimiento (en vez de solo Asignado) para poder marcar en pantalla
   * que ese equipo esta en atencion y no se puede elegir de nuevo.
   */
  private async consultaCmp(rfc: string): Promise<Bien[]> {
    const filas = await this.servidorBienes.findAll({
      where: { rfc, estatus_bien_id: { [Op.in]: [ESTATUS_ASIGNADO, ESTATUS_MANTENIMIENTO] } },
      include: [BienMueble, EstatusBien],
    });

    const vistos = new Set<string>();
    const bienes: Bien[] = [];
    for (const fila of filas) {
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
   * Ficha tecnica del bien para el dictamen de baja (grupo/marca/modelo,
   * ademas de lo que ya trae Bien). null si el id no existe.
   */
  async detalleBien(bienId: number): Promise<{
    numero_inventario: string;
    nombre_bien: string;
    material: string | null;
    marca: string | null;
    modelo: string | null;
  } | null> {
    const bien = await this.bienMuebles.findByPk(bienId);
    if (!bien) return null;
    return {
      numero_inventario: bien.numero_inventario,
      nombre_bien: bien.nombre_bien,
      material: bien.material,
      marca: bien.marca,
      modelo: bien.modelo,
    };
  }

  /**
   * Paso 1 de la atencion: el equipo entra a mantenimiento con el tecnico.
   * Reproduce, en la base local `bienes`, el mismo movimiento que hace
   * solicitudMantenimiento($request->tipo_movimiento = false) en SIASAF: el
   * resguardo activo (ESTATUS_ASIGNADO) pasa a ESTATUS_MANTENIMIENTO y se
   * crea un renglon nuevo, tambien en ESTATUS_MANTENIMIENTO, a nombre del
   * tecnico — ninguno de los dos queda "Asignado" mientras dura el servicio.
   * Nunca lanza: si algo falla, el ticket igual se finaliza en SITickets.
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
      const activo = await this.servidorBienes.findOne({
        where: { bien_mueble_id: bienId, estatus_bien_id: ESTATUS_ASIGNADO },
        order: [['id', 'DESC']],
      });
      if (!activo) {
        return { ok: false, motivo: 'No se encontró el resguardo activo de ese equipo.' };
      }

      await this.servidorBienes.sequelize!.transaction(async (tx) => {
        await activo.update({ estatus_bien_id: ESTATUS_MANTENIMIENTO }, { transaction: tx });
        await this.servidorBienes.create(
          {
            rfc,
            bien_mueble_id: bienId,
            estatus_bien_id: ESTATUS_MANTENIMIENTO,
            fecha_asignacion: new Date(),
          },
          { transaction: tx },
        );
      });
      return { ok: true, motivo: null };
    } catch (e) {
      this.log.warn(`No se pudo iniciar mantenimiento del bien ${bienId} con ${rfc}: ${(e as Error).message}`);
      return {
        ok: false,
        motivo: 'No se pudo registrar que el equipo queda contigo. Avisa al área si hace falta.',
      };
    }
  }

  /**
   * Paso 2: cierra el mantenimiento. El equipo siempre regresa a quien
   * levanto el ticket (el resguardo original vuelve a ESTATUS_ASIGNADO; el
   * renglon del tecnico pasa a ESTATUS_BAJA) — tanto si se reparo como si se
   * dio de baja: aqui termina el proceso de SITickets. El traspaso a
   * "almacen" y el cierre formal de la baja los genera despues, aparte, el
   * area de bienes (usando el dictamen como respaldo); SITickets no lo hace
   * de forma automatica.
   *
   * Nunca lanza: si algo falla, el ticket igual se finaliza en SITickets.
   */
  async finalizarMantenimiento(bienId: number): Promise<{ ok: boolean; motivo: string | null }> {
    try {
      const ultimos = await this.servidorBienes.findAll({
        where: { bien_mueble_id: bienId, estatus_bien_id: ESTATUS_MANTENIMIENTO },
        order: [['id', 'DESC']],
        limit: 2,
      });
      if (ultimos.length < 2) {
        return { ok: false, motivo: 'No se encontraron los registros de mantenimiento de ese equipo.' };
      }
      const [delTecnico, original] = ultimos;

      await this.servidorBienes.sequelize!.transaction(async (tx) => {
        await original.update({ estatus_bien_id: ESTATUS_ASIGNADO }, { transaction: tx });
        await delTecnico.update({ estatus_bien_id: ESTATUS_BAJA }, { transaction: tx });
      });
      return { ok: true, motivo: null };
    } catch (e) {
      this.log.warn(`No se pudo finalizar mantenimiento del bien ${bienId}: ${(e as Error).message}`);
      return {
        ok: false,
        motivo: 'No se pudo cerrar el registro de mantenimiento del equipo. Avisa al área si hace falta.',
      };
    }
  }
}
