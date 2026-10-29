import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ExcelJS from 'exceljs';
import {
  Area,
  CatalogoProblema,
  DependenciaValidador,
  ESTATUS,
  ESTATUS_FINALES,
  EstatusClave,
  Inmueble,
  SDependencia,
  SDepartamento,
  SDireccion,
  Sede,
  Servicio,
  ServicioUsuarioPermitido,
  ServicioValidador,
  SUbicacion,
  SUbicacionDepartamento,
  SUsuario,
  TecnicoExterno,
  Ticket,
  TicketBitacora,
  TicketSesion,
  TicketTecnico,
  Usuario,
} from '../database/models';
import { ReglasService } from './reglas.service';
import { TrazaService } from './traza.service';
import { BienesService } from '../bienes/bienes.service';
import { DictamenService } from './dictamen.service';
import { CedulaCustodiaService } from './cedula-custodia.service';
import { ImpresorasService } from '../impresoras/impresoras.service';
import {
  RFC_SIEMPRE_A_NOMBRE_PROPIO,
  USUARIOS_CIERRE_SERVICIO,
  USUARIOS_FILTRO_SERVICIO_GENERADOS,
  USUARIOS_OCULTOS_LISTADO,
  USUARIOS_REABREN_TICKETS,
} from '../catalogos/catalogos.service';
import type { UsuarioToken } from '../common/usuario-actual.decorator';
import { dominioInstitucional, esCampoCuentaCorreo, revisaCuentaCorreo } from '../common/correo';
import {
  CrearInternoDto,
  CrearTicketDto,
  CambiarSolicitanteDto,
  DatosGeneralesDto,
  PrioridadDto,
  ReasignarDto,
  ReclasificarDto,
  ResolverDto,
} from './dto/tickets.dto';
import { AtenderCmpDto } from './dto/atender-cmp.dto';
import { fechaExcel, fechaLocal, minutosHabiles } from '../common/fecha';

/**
 * Carpeta donde se guardan los dictamenes de baja (pdf). Vive dentro de
 * storage/ porque en produccion (docker-compose.prod.yml) es la unica
 * carpeta que se monta como volumen persistente; uploads/ se hubiera
 * perdido en cada redeploy.
 */
export const CARPETA_DICTAMENES = join(process.cwd(), 'storage', 'dictamenes');

/** Mismo criterio que CARPETA_DICTAMENES: dentro de storage/ para sobrevivir un redeploy. */
export const CARPETA_CEDULAS = join(process.cwd(), 'storage', 'cedulas');

/**
 * Motivo exacto de pausa (ver MOTIVOS_ESPERA en el frontend) que dispara la
 * cedula de salida: el tecnico se lleva el equipo del edificio del
 * solicitante para revisarlo, y la cedula documenta esa custodia temporal.
 */
const MOTIVO_RETIRO_EQUIPO = 'Retirar el equipo del lugar para su revisión';

/**
 * Roles que atienden tickets y por tanto ven solo lo que traen turnado.
 * "sistemas" es un rol de una sola persona (SISTEMAS/PROGRESS, ver
 * migracion 024_rol_sistemas.sql): atiende como cualquier tecnico, con la
 * especialidad dada por tecnico_servicio en vez de estar cableada en codigo.
 */
const ROLES_TECNICOS = ['tecnico', 'proveedor', 'jefe', 'sistemas'];

/** Solicitud de toner/cartucho: aqui ademas del modelo se pide el color a cambiar. */
const CLAVES_TONER = ['IMP-01', 'IMPA-01'];

/**
 * Servicios que se registran tambien a nombre de gente dada de baja en saf
 * (Estado 0): la carta de no adeudo se tramita justo cuando alguien deja la
 * institucion, asi que casi siempre ya esta inactivo.
 */
const SERVICIOS_ACEPTAN_BAJAS = ['CNA'];

/** Lo que sigue en manos del area (el reporte los separa de resueltos y cerrados). */
const ESTATUS_ABIERTOS_REPORTE = ['REGISTRADO', 'ASIGNADO', 'EN_ATENCION', 'EN_ESPERA'];

/** Estatus como lo lee una persona en el Excel, con los mismos matices que el chip de la app. */
function estatusLegible(t: Ticket): string {
  if (t.en_cola) return 'En cola (sin técnico)';
  if (t.estatus === 'CERRADO' && t.cierre_por_omision) return 'Cerrado por omisión';
  return (
    {
      REGISTRADO: 'Registrado',
      ASIGNADO: 'Asignado',
      EN_ATENCION: 'En atención',
      EN_ESPERA: 'En espera',
      RESUELTO: 'Resuelto',
      CERRADO: 'Cerrado por el usuario',
      CANCELADO: 'Cancelado',
    }[t.estatus] ?? t.estatus
  );
}

const INCLUDES = [
  { model: Servicio, as: 'servicio' },
  { model: Servicio, as: 'servicio_original' },
  { model: CatalogoProblema, as: 'problema' },
  { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
  { model: Area },
  { model: Sede },
  { model: TecnicoExterno },
];

@Injectable()
export class TicketsService {
  constructor(
    @InjectConnection() private readonly db: Sequelize,
    @InjectModel(Ticket) private readonly tickets: typeof Ticket,
    @InjectModel(TicketTecnico) private readonly equipos: typeof TicketTecnico,
    @InjectModel(TicketSesion) private readonly sesiones: typeof TicketSesion,
    @InjectModel(TicketBitacora) private readonly bitacora: typeof TicketBitacora,
    @InjectModel(CatalogoProblema) private readonly problemas: typeof CatalogoProblema,
    @InjectModel(Servicio) private readonly serviciosM: typeof Servicio,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(Area) private readonly areas: typeof Area,
    @InjectModel(Inmueble) private readonly inmuebles: typeof Inmueble,
    @InjectModel(ServicioUsuarioPermitido)
    private readonly permitidosServicio: typeof ServicioUsuarioPermitido,
    @InjectModel(DependenciaValidador)
    private readonly dependenciaValidador: typeof DependenciaValidador,
    @InjectModel(ServicioValidador)
    private readonly servicioValidador: typeof ServicioValidador,
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
    @InjectModel(SDependencia, 'saf') private readonly sDependencias: typeof SDependencia,
    @InjectModel(SDireccion, 'saf') private readonly sDirecciones: typeof SDireccion,
    @InjectModel(SDepartamento, 'saf') private readonly sDepartamentos: typeof SDepartamento,
    @InjectModel(SUbicacion, 'saf') private readonly sUbicaciones: typeof SUbicacion,
    @InjectModel(SUbicacionDepartamento, 'saf')
    private readonly sUbicacionesDepartamento: typeof SUbicacionDepartamento,
    private readonly reglas: ReglasService,
    private readonly traza: TrazaService,
    private readonly config: ConfigService,
    private readonly bienesSrv: BienesService,
    private readonly dictamenSrv: DictamenService,
    private readonly cedulaCustodiaSrv: CedulaCustodiaService,
    private readonly impresorasSrv: ImpresorasService,
  ) {}

  /* ==================================================================
     Consulta. El alcance lo decide el rol, no la pantalla.
     ================================================================== */

  /**
   * Filtro base por rol. Es la pieza que faltaba en la API original: alli
   * cualquiera podia pedir cualquier ticket porque el identificador venia del
   * navegador. Aqui el alcance sale del token y no se puede ampliar por URL.
   */
  /**
   * modo solo importa para un tecnico/jefe/proveedor, que tiene dos
   * historicos distintos (lo que le turnaron atender y lo que el mismo
   * registro como solicitante):
   *   'todo'     — la union de ambos. Es lo correcto para autorizar una
   *                accion sobre UN ticket puntual (detalle, corregir datos,
   *                etc.): no importa por cual de los dos motivos le toca,
   *                sigue siendo suyo.
   *   'propios'  — "Mis tickets": solo lo que registro para si mismo.
   *   'turnados' — "Mis tickets turnados": solo lo que le toca atender.
   * Para el resto de roles el modo no cambia nada.
   */
  /**
   * Alcance para UN ticket puntual (detalle, confirmar, corregir datos…). Para
   * gestor y validador, alcance('todo') es su lista de "Tickets generados"
   * (lo registrado a nombre de otros) y deja fuera lo que registraron a su
   * propio nombre: sin la union, al crear un ticket propio el detalle que se
   * devuelve fallaba con "no existe o no esta a tu alcance" — aunque el
   * ticket SI se habia creado — y tampoco podian abrirlo ni confirmarlo.
   */
  private async alcanceTicket(usuario: UsuarioToken): Promise<Record<string, unknown>> {
    if (usuario.rol === 'gestor' || usuario.rol === 'validador') {
      return {
        [Op.or]: [await this.alcance(usuario, 'todo'), await this.alcance(usuario, 'propios')],
      };
    }
    return this.alcance(usuario);
  }

  private async alcance(
    usuario: UsuarioToken,
    modo: 'todo' | 'propios' | 'turnados' = 'todo',
  ): Promise<Record<string, unknown>> {
    /** El operador ve todo, igual que el administrador, pero no administra catalogos. */
    if (usuario.rol === 'admin' || usuario.rol === 'operador') {
      if (modo === 'propios') {
        return {
          [Op.or]: [
            /*
             * solicitante_id vive en dos espacios de ids (local o saf, ver
             * comentario del modelo Ticket): comparar solo por numero puede
             * chocar por casualidad con el id de otra persona en el otro
             * espacio (p.ej. el id local de un usuario de planta coincide
             * con el id_Usuario de saf de alguien mas). El nombre, que el
             * token siempre trae igual al que se grabo en el ticket al
             * crearlo, desempata sin ambiguedad.
             */
            { solicitante_id: usuario.id, solicitante_nombre: usuario.nombre },
            { registrado_por: usuario.id },
          ],
        };
      }
      return {};
    }
    if (usuario.rol === 'solicitante') {
      /*
       * Servicios con cierre especial (ver USUARIOS_CIERRE_SERVICIO, p.ej.
       * Cartas de no adeudo): quien los cierra reemplaza por completo al
       * solicitante real —confirma, rechaza y reabre en su lugar— asi que
       * tampoco debe aparecerle en su propia lista ni poder abrirlos.
       */
      const where: Record<string, unknown> = {
        solicitante_id: usuario.id,
        solicitante_nombre: usuario.nombre,
      };
      const clavesCierreEspecial = Object.keys(USUARIOS_CIERRE_SERVICIO);
      if (clavesCierreEspecial.length) {
        const servicios = await this.serviciosM.findAll({
          where: { clave: { [Op.in]: clavesCierreEspecial } },
          attributes: ['id'],
        });
        if (servicios.length) {
          where.servicio_id = { [Op.notIn]: servicios.map((s) => s.id) };
        }
      }
      return where;
    }
    /**
     * "Mis tickets" (modo 'propios'): solo lo que el gestor/validador
     * registro a su propio nombre, como cualquier solicitante — no lo que
     * registro a nombre de otros, eso vive en "Tickets generados". Lo que
     * tiene en validacion (a su nombre o a nombre de otro) sigue aparte, en
     * misPorValidar().
     */
    if (usuario.rol === 'gestor') {
      if (modo === 'todo') {
        /*
         * "Tickets generados": cada gestor ve SOLO lo que el mismo registro
         * "a nombre de otro" — no lo de otros gestores de su misma
         * dependencia, aunque antes si se mezclaba ahi.
         */
        const claveServicio = USUARIOS_FILTRO_SERVICIO_GENERADOS[usuario.id];
        if (claveServicio) {
          /*
           * Caso especial (ver USUARIOS_CIERRE_SERVICIO): ve TODO el
           * servicio, de cualquier dependencia, lo haya registrado el o
           * no — es quien cierra esos tickets en lugar del solicitante
           * real, y ese servicio (Cartas de no adeudo) lo puede pedir
           * gente de cualquier dependencia, no solo la suya.
           */
          const servicio = await this.serviciosM.findOne({ where: { clave: claveServicio } });
          return { servicio_id: servicio?.id ?? null };
        }
        return { registrado_por: usuario.id };
      }
      /* Mismo desempate por nombre que arriba: evita que choque con el id de
         otra persona en el otro espacio de ids. */
      return { solicitante_id: usuario.id, solicitante_nombre: usuario.nombre };
    }
    if (usuario.rol === 'validador') {
      if (modo === 'todo') {
        /* "Tickets generados" del validador: todo lo de la(s) dependencia(s)
           que tiene asignadas en dependencia_validador, de cualquier gestor —
           su trabajo es revisar lo de todos, no solo lo suyo. */
        const dependenciaIds = await this.dependenciasDe(usuario.id);
        if (!dependenciaIds.length) return { id: null };
        const where: Record<string, unknown> = { dependencia_id: { [Op.in]: dependenciaIds } };
        /* Servicios que puede autorizar (ver ServicioValidador). Vacio = sin restriccion. */
        const servicioIds = await this.serviciosQueValida(usuario.id);
        if (servicioIds.length) where.servicio_id = { [Op.in]: servicioIds };
        return where;
      }
      return { solicitante_id: usuario.id, solicitante_nombre: usuario.nombre };
    }
    if (ROLES_TECNICOS.includes(usuario.rol)) {
      /*
       * Un tecnico puede tener historico como solicitante en dos espacios de
       * id distintos: los tickets que registro directo desde su cuenta de
       * tecnico (solicitante_id = usuario.id local) y los que registro antes
       * como solicitante externo (solicitante_id = su id en saf.s_usuario),
       * que solo se puede encontrar cruzando por rfc.
       */
      const solicitanteIds: number[] = [usuario.id];
      if (!usuario.externo) {
        const local = await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] });
        if (local?.rfc) {
          const sUsuario = await this.sUsuarios.findOne({ where: { N_Usuario: local.rfc } });
          if (sUsuario) solicitanteIds.push(sUsuario.id_Usuario);
        }
      }
      /* Mismo desempate por nombre que en las demas ramas de alcance(). */
      const comoPropio = {
        solicitante_id: { [Op.in]: solicitanteIds },
        solicitante_nombre: usuario.nombre,
      };
      const comoTurnado = {
        [Op.or]: [
          { tecnico_id: usuario.id },
          {
            id: {
              [Op.in]: Sequelize.literal(
                `(SELECT ticket_id FROM ticket_tecnico WHERE usuario_id = ${Number(usuario.id)})`,
              ),
            },
          },
        ],
      };
      if (modo === 'propios') return comoPropio;
      if (modo === 'turnados') return comoTurnado;
      return { [Op.or]: [comoPropio, comoTurnado] };
    }
    return { id: null };
  }

  /** Arma el where de listar()/reporteExcel() a partir de los mismos filtros de query string. */
  private async construyeFiltro(
    usuario: UsuarioToken,
    filtros: Record<string, string | undefined>,
  ): Promise<Record<string | symbol, unknown>> {
    const modo =
      filtros.propios === 'true' ? 'propios' : filtros.turnados === 'true' ? 'turnados' : 'todo';
    const where: Record<string | symbol, unknown> = { ...(await this.alcance(usuario, modo)) };

    /*
     * §16 pendientes de validacion (o rechazados ahi) no aparecen en ningun
     * listado normal —"Mis tickets", bandeja—, excepto "Tickets generados"
     * del gestor: como ya esta acotado a lo que el mismo registro (ver
     * alcance()), tiene sentido que vea ahi TODO lo suyo de principio a fin,
     * no solo lo ya aprobado. El validador los ve aparte en por-validar().
     */
    if (!(usuario.rol === 'gestor' && modo === 'todo')) {
      where.pendiente_validacion = false;
      where.motivo_rechazo_validacion = { [Op.is]: null };
    }

    /*
     * §listados: ver USUARIOS_OCULTOS_LISTADO — solo aplica en listados
     * generales (modo 'todo'), nunca en la bandeja propia de quien registra
     * (modo 'propios'/'turnados'), donde si necesita verlos.
     */
    if (modo === 'todo') {
      for (const [rfc, claveServicio] of Object.entries(USUARIOS_OCULTOS_LISTADO)) {
        const [quienRegistra, servicio] = await Promise.all([
          this.usuarios.findOne({ where: { rfc }, attributes: ['id'] }),
          this.serviciosM.findOne({ where: { clave: claveServicio }, attributes: ['id'] }),
        ]);
        if (!quienRegistra || !servicio) continue;
        const exclusion = { [Op.not]: { registrado_por: quienRegistra.id, servicio_id: servicio.id } };
        where[Op.and] = Array.isArray(where[Op.and])
          ? [...(where[Op.and] as unknown[]), exclusion]
          : where[Op.and]
            ? [where[Op.and], exclusion]
            : [exclusion];
      }
    }

    if (filtros.servicio) where.servicio_id = Number(filtros.servicio);
    if (filtros.prioridad) where.prioridad = filtros.prioridad;
    if (filtros.tecnico) where.tecnico_id = Number(filtros.tecnico);
    if (filtros.interno === 'true') where.interno = true;
    if (filtros.interno === 'false') where.interno = false;
    if (filtros.estatus === 'EN_COLA') where.en_cola = true;
    else if (filtros.estatus) where.estatus = filtros.estatus;
    if (filtros.abiertos === 'true') where.estatus = { [Op.notIn]: ESTATUS_FINALES };
    /** Para «Equipos dados de baja»: tickets CMP donde el tecnico dio de baja el equipo. */
    if (filtros.resultado_cmp) where.resultado_cmp = filtros.resultado_cmp;

    /*
     * Busca por folio vigente o por folio general (TK/DI/N): el solicitante
     * pudo dar cualquiera de los dos, ya que uno reemplaza al otro al
     * cerrar. Se combina con Op.and para no pisar el Op.or que ya puso
     * alcance() (gestor/tecnico ven por varias vias a la vez).
     */
    if (filtros.folio?.trim()) {
      const termino = `%${filtros.folio.trim()}%`;
      const condicionFolio = {
        [Op.or]: [{ folio: { [Op.like]: termino } }, { folio_general: { [Op.like]: termino } }],
      };
      if (where[Op.or]) {
        const previo = where[Op.or];
        delete where[Op.or];
        where[Op.and] = [{ [Op.or]: previo }, condicionFolio];
      } else {
        Object.assign(where, condicionFolio);
      }
    }

    return where;
  }

  async listar(usuario: UsuarioToken, filtros: Record<string, string | undefined> = {}) {
    const where = await this.construyeFiltro(usuario, filtros);

    const filas = await this.tickets.findAll({
      where,
      include: INCLUDES,
      order: [['f_registro', 'DESC']],
      limit: 500,
    });

    const objetivos = await this.reglas.objetivos();
    const conteos = await this.conteoSesiones(filas.map((t) => t.id));
    const mapaDependencias = await this.mapaDependenciasSaf();
    return filas.map((t) => this.resumen(t, objetivos, conteos.get(t.id) ?? 0, mapaDependencias));
  }

  /**
   * Reporte en excel para el administrador: mismos filtros que listar() (§
   * construyeFiltro), pero sin el tope de 500 — el reporte debe traer todo lo
   * que cumpla el filtro, no solo lo mas reciente.
   */
  async reporteExcel(
    usuario: UsuarioToken,
    filtros: Record<string, string | undefined>,
  ): Promise<ExcelJS.Buffer> {
    const where = await this.construyeFiltro(usuario, filtros);
    const filas = await this.tickets.findAll({ where, include: INCLUDES, order: [['f_registro', 'DESC']] });
    const objetivos = await this.reglas.objetivos();
    /*
     * Direccion/departamento reales del solicitante viven en saf, no en el
     * ticket local (dependencia_id/area_id son una clasificacion propia,
     * mas amplia y casi siempre vacia en area_id) — se resuelven aparte,
     * igual que en detalle() y nivelTonerDelTicket().
     */
    const orgs = await Promise.all(
      filas.map((t) =>
        this.datosOrganizacionalesDelSolicitante(t.solicitante_id, t.solicitante_nombre),
      ),
    );

    const ids = filas.map((t) => t.id);
    const [sesiones, eventos] = ids.length
      ? await Promise.all([
          this.sesiones.findAll({
            where: { ticket_id: { [Op.in]: ids } },
            attributes: ['ticket_id', 'usuario_id', 'inicio', 'fin'],
          }),
          this.bitacora.findAll({
            where: { ticket_id: { [Op.in]: ids } },
            order: [['fecha', 'ASC'], ['id', 'ASC']],
          }),
        ])
      : [[], []];

    const servicioDe = (t: Ticket) => t.servicio?.nombre ?? 'Sin clasificar';
    const horas = (min: number) => Math.round((min / 60) * 10) / 10;
    const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const enTiempo = (t: Ticket) =>
      ReglasService.minutosActivos(t) <= (objetivos.get(t.prioridad) ?? 1440);
    const vencidoAbierto = (t: Ticket) =>
      ESTATUS_ABIERTOS_REPORTE.includes(t.estatus) &&
      ReglasService.vencido(t, objetivos.get(t.prioridad) ?? 1440);
    const minSesion = (s: TicketSesion) =>
      ((s.fin ? new Date(s.fin).getTime() : Date.now()) - new Date(s.inicio).getTime()) / 60_000;

    /* Ordenados por servicio y, dentro de cada uno, lo mas reciente primero. */
    const ordenados = filas
      .map((t, i) => ({ t, org: orgs[i] }))
      .sort(
        (a, b) =>
          servicioDe(a.t).localeCompare(servicioDe(b.t), 'es') ||
          (b.t.f_registro?.getTime() ?? 0) - (a.t.f_registro?.getTime() ?? 0),
      );

    const libro = new ExcelJS.Workbook();

    /* ---------------------------------------------------- Por tecnico */
    const hTec = libro.addWorksheet('Por técnico');
    hTec.columns = [
      { header: 'Técnico', key: 'tecnico', width: 32 },
      { header: 'Tickets asignados', key: 'asignados', width: 12 },
      { header: 'Abiertos', key: 'abiertos', width: 10 },
      { header: 'En espera', key: 'espera', width: 10 },
      { header: 'Resueltos', key: 'resueltos', width: 10 },
      { header: 'Resueltos en tiempo', key: 'en_tiempo', width: 12 },
      { header: '% en tiempo', key: 'pct', width: 11 },
      { header: 'Abiertos vencidos', key: 'vencidos', width: 11 },
      { header: 'Tiempo prom. de resolución (h)', key: 'prom', width: 16 },
      { header: 'Visitas (reloj iniciado)', key: 'visitas', width: 13 },
      { header: 'Tiempo total en sitio (h)', key: 'sitio', width: 14 },
      { header: 'Reaperturas + rechazos', key: 'reab', width: 14 },
    ];
    const porTecnico = new Map<string, Ticket[]>();
    for (const { t } of ordenados) {
      const nombre = t.tecnico?.nombre ?? 'Sin asignar';
      porTecnico.set(nombre, [...(porTecnico.get(nombre) ?? []), t]);
    }
    for (const [nombre, suyos] of [...porTecnico].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      const resueltos = suyos.filter((t) => t.f_resolucion);
      const tecnicoId = suyos[0].tecnico_id;
      const idsSuyos = new Set(suyos.map((t) => t.id));
      const visitas = sesiones.filter((s) => s.usuario_id === tecnicoId && idsSuyos.has(s.ticket_id));
      const prom = promedio(resueltos.map((t) => ReglasService.minutosActivos(t)));
      hTec.addRow({
        tecnico: nombre,
        asignados: suyos.length,
        abiertos: suyos.filter((t) => ESTATUS_ABIERTOS_REPORTE.includes(t.estatus)).length,
        espera: suyos.filter((t) => t.estatus === 'EN_ESPERA').length,
        resueltos: resueltos.length,
        en_tiempo: resueltos.filter(enTiempo).length,
        pct: resueltos.length ? resueltos.filter(enTiempo).length / resueltos.length : null,
        vencidos: suyos.filter(vencidoAbierto).length,
        prom: prom === null ? null : horas(prom),
        visitas: visitas.length,
        sitio: horas(visitas.reduce((a, s) => a + minSesion(s), 0)),
        reab: suyos.reduce((a, t) => a + t.reaperturas + t.rechazos, 0),
      });
    }
    hTec.getColumn('pct').numFmt = '0%';

    /* --------------------------------------------------- Por servicio */
    const hSrv = libro.addWorksheet('Por servicio');
    hSrv.columns = [
      { header: 'Servicio', key: 'servicio', width: 36 },
      { header: 'Total', key: 'total', width: 9 },
      { header: 'Abiertos', key: 'abiertos', width: 10 },
      { header: 'Resueltos (por confirmar)', key: 'resueltos', width: 14 },
      { header: 'Cerrados (usuario)', key: 'cerrados_usuario', width: 15 },
      { header: 'Cerrados (omisión)', key: 'cerrados_omision', width: 15 },
      { header: 'Cancelados', key: 'cancelados', width: 11 },
      { header: 'Abiertos vencidos', key: 'vencidos', width: 11 },
      { header: '% resueltos en tiempo', key: 'pct', width: 13 },
      { header: 'Tiempo prom. de resolución (h)', key: 'prom', width: 16 },
    ];
    const porServicio = new Map<string, Ticket[]>();
    for (const { t } of ordenados) {
      porServicio.set(servicioDe(t), [...(porServicio.get(servicioDe(t)) ?? []), t]);
    }
    for (const [servicio, lista] of porServicio) {
      const resueltos = lista.filter((t) => t.f_resolucion);
      const prom = promedio(resueltos.map((t) => ReglasService.minutosActivos(t)));
      hSrv.addRow({
        servicio,
        total: lista.length,
        abiertos: lista.filter((t) => ESTATUS_ABIERTOS_REPORTE.includes(t.estatus)).length,
        resueltos: lista.filter((t) => t.estatus === 'RESUELTO').length,
        cerrados_usuario: lista.filter((t) => t.estatus === 'CERRADO' && !t.cierre_por_omision).length,
        cerrados_omision: lista.filter((t) => t.estatus === 'CERRADO' && t.cierre_por_omision).length,
        cancelados: lista.filter((t) => t.estatus === 'CANCELADO').length,
        vencidos: lista.filter(vencidoAbierto).length,
        pct: resueltos.length ? resueltos.filter(enTiempo).length / resueltos.length : null,
        prom: prom === null ? null : horas(prom),
      });
    }
    hSrv.getColumn('pct').numFmt = '0%';

    /* -------------------------------------------------------- Tickets */
    const hoja = libro.addWorksheet('Tickets');
    hoja.columns = [
      { header: 'Servicio', key: 'servicio', width: 26 },
      { header: 'Folio', key: 'folio', width: 18 },
      { header: 'Folio general', key: 'folio_general', width: 18 },
      { header: 'Problema', key: 'problema', width: 36 },
      { header: 'Color de tóner', key: 'color_toner', width: 14 },
      { header: 'Prioridad', key: 'prioridad', width: 10 },
      { header: 'Estatus', key: 'estatus', width: 18 },
      { header: 'Solicitante', key: 'solicitante', width: 30 },
      { header: 'Dependencia', key: 'dependencia', width: 30 },
      { header: 'Dirección', key: 'direccion', width: 32 },
      { header: 'Departamento', key: 'departamento', width: 32 },
      { header: 'Edificio de atención', key: 'edificio', width: 26 },
      { header: 'Técnico', key: 'tecnico', width: 26 },
      { header: 'Fecha de registro', key: 'f_registro', width: 17 },
      { header: 'Fecha de resolución', key: 'f_resolucion', width: 17 },
      { header: 'Fecha de cierre', key: 'f_validacion', width: 17 },
      { header: 'Tiempo activo (h)', key: 'horas_activo', width: 12 },
      { header: 'Vencido', key: 'vencido', width: 9 },
      { header: 'Reaperturas', key: 'reaperturas', width: 11 },
    ];
    for (const { t, org } of ordenados) {
      hoja.addRow({
        servicio: servicioDe(t),
        folio: t.folio,
        folio_general: t.folio_general,
        problema: t.problema?.descripcion ?? 'Sin clasificar',
        color_toner: t.color_toner ?? '—',
        prioridad: t.prioridad,
        estatus: estatusLegible(t),
        solicitante: t.solicitante_nombre ?? t.solicitante?.nombre ?? '—',
        dependencia: org.dependencia ?? '—',
        direccion: org.direccionCompleta ?? '—',
        departamento: org.departamento ?? '—',
        edificio: t.edificio_atencion ?? '—',
        tecnico: t.tecnico?.nombre ?? 'Sin asignar',
        f_registro: fechaExcel(t.f_registro),
        f_resolucion: fechaExcel(t.f_resolucion),
        f_validacion: fechaExcel(t.f_validacion),
        horas_activo: horas(ReglasService.minutosActivos(t)),
        vencido: ReglasService.vencido(t, objetivos.get(t.prioridad) ?? 1440) ? 'Sí' : 'No',
        reaperturas: t.reaperturas,
      });
    }
    for (const c of ['f_registro', 'f_resolucion', 'f_validacion']) {
      hoja.getColumn(c).numFmt = 'dd/mm/yyyy hh:mm';
    }

    /* ------------------------------------------------------- Bitacora */
    const hBit = libro.addWorksheet('Bitácora');
    hBit.columns = [
      { header: 'Servicio', key: 'servicio', width: 26 },
      { header: 'Folio', key: 'folio', width: 18 },
      { header: 'Fecha', key: 'fecha', width: 17 },
      { header: 'Usuario', key: 'usuario', width: 30 },
      { header: 'Acción', key: 'accion', width: 22 },
      { header: 'Detalle', key: 'detalle', width: 60 },
      { header: 'Motivo', key: 'motivo', width: 24 },
      { header: 'Antes', key: 'antes', width: 18 },
      { header: 'Después', key: 'despues', width: 18 },
    ];
    const eventosDe = new Map<number, TicketBitacora[]>();
    for (const e of eventos) eventosDe.set(e.ticket_id, [...(eventosDe.get(e.ticket_id) ?? []), e]);
    for (const { t } of ordenados) {
      for (const e of eventosDe.get(t.id) ?? []) {
        hBit.addRow({
          servicio: servicioDe(t),
          folio: t.folio,
          fecha: fechaExcel(e.fecha),
          usuario: e.usuario_nombre ?? 'Sistema',
          accion: e.accion,
          detalle: e.detalle ?? '',
          motivo: e.motivo ?? '',
          antes: e.valor_antes ?? '',
          despues: e.valor_nuevo ?? '',
        });
      }
    }
    hBit.getColumn('fecha').numFmt = 'dd/mm/yyyy hh:mm';
    hBit.getColumn('detalle').alignment = { wrapText: true, vertical: 'top' };

    /* Encabezado con color, fijo al desplazarse y con filtros en cada columna. */
    for (const h of [hTec, hSrv, hoja, hBit]) {
      const encabezado = h.getRow(1);
      encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2434' } };
      encabezado.alignment = { vertical: 'middle', wrapText: true };
      encabezado.height = 32;
      h.views = [{ state: 'frozen', ySplit: 1 }];
      h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnCount } };
    }

    return libro.xlsx.writeBuffer();
  }

  /** Excel de «Equipos dados de baja»: mismas columnas que la tabla, sin el dictamen (ese es el pdf aparte). */
  async bajasExcel(usuario: UsuarioToken): Promise<ExcelJS.Buffer> {
    const where = { ...(await this.alcance(usuario)), resultado_cmp: 'baja' };
    const filas = await this.tickets.findAll({ where, include: INCLUDES, order: [['f_registro', 'DESC']] });

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Equipos dados de baja');
    hoja.columns = [
      { header: 'Folio general', key: 'folio_general', width: 18 },
      { header: 'Folio', key: 'folio', width: 18 },
      { header: 'Solicitante', key: 'solicitante', width: 30 },
      { header: 'Técnico', key: 'tecnico', width: 26 },
      { header: 'No. de inventario', key: 'inventario', width: 20 },
      { header: 'Fecha', key: 'f_registro', width: 19 },
    ];
    hoja.getRow(1).font = { bold: true };
    hoja.getColumn('f_registro').numFmt = 'dd/mm/yyyy hh:mm';

    for (const t of filas) {
      hoja.addRow({
        folio_general: t.folio_general,
        folio: t.folio,
        solicitante: t.solicitante_nombre ?? t.solicitante?.nombre ?? '—',
        tecnico: t.tecnico?.nombre ?? 'Sin asignar',
        inventario: t.contexto ?? '—',
        f_registro: fechaExcel(t.f_registro),
      });
    }

    return libro.xlsx.writeBuffer();
  }

  /**
   * Datos agregados para las graficas del reporte (mismos filtros que
   * listar()/reporteExcel()). Se agrupa en memoria en vez de con SQL porque
   * "vencido" es una regla de negocio (ReglasService.vencido), no una
   * columna: no se puede expresar en un GROUP BY.
   */
  async reporteDatos(usuario: UsuarioToken, filtros: Record<string, string | undefined>) {
    const where = await this.construyeFiltro(usuario, filtros);
    const filas = await this.tickets.findAll({ where, include: INCLUDES });
    const objetivos = await this.reglas.objetivos();

    const porEstatus = new Map<string, number>();
    const porPrioridad = new Map<string, number>();
    const porServicio = new Map<string, number>();
    const porMes = new Map<string, number>();
    const hoy = new Date().toDateString();
    const esHoy = (f: Date | null) => !!f && new Date(f).toDateString() === hoy;

    let vencidos = 0;
    let recibidosHoy = 0;
    let enCurso = 0;
    let enEspera = 0;
    let esperandoTurno = 0;
    let cerradosHoy = 0;
    let finalizadosHoy = 0;

    for (const t of filas) {
      /* Mismo criterio que la pestaña de /tickets: CERRADO se separa segun quien lo cerro. */
      const claveEstatus =
        t.estatus === 'CERRADO' ? (t.cierre_por_omision ? 'CERRADO_OMISION' : 'CERRADO_USUARIO') : t.estatus;
      porEstatus.set(claveEstatus, (porEstatus.get(claveEstatus) ?? 0) + 1);
      porPrioridad.set(t.prioridad, (porPrioridad.get(t.prioridad) ?? 0) + 1);
      const servicio = t.servicio?.nombre ?? 'Sin clasificar';
      porServicio.set(servicio, (porServicio.get(servicio) ?? 0) + 1);
      if (ReglasService.vencido(t, objetivos.get(t.prioridad) ?? 1440)) vencidos++;
      /* Pendiente de validacion: f_registro aun no existe, no cuenta por mes todavia. */
      if (t.f_registro) {
        const mes = fechaLocal(new Date(t.f_registro)).slice(0, 7);
        porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
      }

      if (esHoy(t.f_registro)) recibidosHoy++;
      if (t.estatus === ESTATUS.EN_ATENCION) enCurso++;
      if (t.estatus === ESTATUS.EN_ESPERA) enEspera++;
      if (t.en_cola) esperandoTurno++;
      if (t.estatus === ESTATUS.CERRADO && esHoy(t.f_validacion)) cerradosHoy++;
      if (esHoy(t.f_resolucion)) finalizadosHoy++;
    }

    const aOrdenado = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([clave, total]) => ({ clave, total }));

    /* Para estatus no tiene caso ordenar por cantidad: la grafica debe leerse
       en el orden del ciclo de vida del ticket, no saltando segun quien tiene
       mas. */
    const ORDEN_ESTATUS = [
      'REGISTRADO',
      'ASIGNADO',
      'EN_ATENCION',
      'EN_ESPERA',
      'RESUELTO',
      'CERRADO_USUARIO',
      'CERRADO_OMISION',
      'CANCELADO',
    ];
    const porEstatusOrdenado = [...porEstatus.entries()]
      .sort((a, b) => ORDEN_ESTATUS.indexOf(a[0]) - ORDEN_ESTATUS.indexOf(b[0]))
      .map(([clave, total]) => ({ clave, total }));

    return {
      total: filas.length,
      vencidos,
      a_tiempo: filas.length - vencidos,
      /** §11 · misma foto que el tablero de actividad del dia (ver reportes.html). */
      recibidos_hoy: recibidosHoy,
      en_curso: enCurso,
      en_espera: enEspera,
      esperando_turno: esperandoTurno,
      cerrados_hoy: cerradosHoy,
      fuera_de_tiempo: vencidos,
      finalizados_hoy: finalizadosHoy,
      por_estatus: porEstatusOrdenado,
      por_prioridad: aOrdenado(porPrioridad),
      por_servicio: aOrdenado(porServicio),
      tendencia_mensual: [...porMes.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, total]) => ({ mes, total })),
    };
  }

  /** Admin/operador dieron clic en "Copiar datos": queda grabado, no solo en su navegador. */
  async marcarCopiado(id: number, usuario: UsuarioToken): Promise<void> {
    const ticket = await this.tickets.findOne({ where: { id, ...(await this.alcanceTicket(usuario)) } });
    if (!ticket) throw new NotFoundException('El ticket no existe o no esta a tu alcance');
    if (!ticket.datos_copiados) await ticket.update({ datos_copiados: true });
  }

  async detalle(id: number, usuario: UsuarioToken) {
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcanceTicket(usuario)) },
      include: INCLUDES,
    });
    if (!ticket) throw new NotFoundException('El ticket no existe o no esta a tu alcance');

    const [sesiones, bitacora, equipo, objetivos] = await Promise.all([
      this.sesiones.findAll({
        where: { ticket_id: id },
        include: [{ model: Sede, attributes: ['nombre'] }],
        order: [['inicio', 'ASC']],
      }),
      this.bitacora.findAll({
        where: { ticket_id: id },
        include: [{ model: Usuario, attributes: ['nombre'] }],
        order: [['fecha', 'ASC']],
      }),
      this.equipos.findAll({
        where: { ticket_id: id },
        include: [{ model: Usuario, attributes: ['id', 'nombre'] }],
      }),
      this.reglas.objetivos(),
    ]);

    const segundosCampo = sesiones.reduce(
      (a, s) =>
        a +
        ((s.fin ? new Date(s.fin).getTime() : Date.now()) - new Date(s.inicio).getTime()) / 1000,
      0,
    );

    /*
     * Organizacion real del solicitante, tal como vive en saf (no el
     * dependencia_id/area_id local del ticket): es solo informativa, nunca
     * se corrige a mano. Mismo dato que ya usa el dictamen de baja.
     */
    const orgSaf = await this.datosOrganizacionalesDelSolicitante(
      ticket.solicitante_id,
      ticket.solicitante_nombre,
    );

    const mapaDependencias = await this.mapaDependenciasSaf();
    return {
      ...this.resumen(ticket, objetivos, sesiones.length, mapaDependencias),
      dependencia_saf: orgSaf.dependencia,
      direccion_saf: orgSaf.direccion,
      departamento_saf: orgSaf.departamento,
      texto_libre: ticket.texto_libre,
      diagnostico: ticket.diagnostico,
      solucion: ticket.solucion,
      refacciones: ticket.refacciones,
      /** Solo aplica a servicio CNA (Cartas de no adeudo). */
      revision_bienes: ticket.revision_bienes,
      observaciones_revision: ticket.observaciones_revision,
      motivo_espera: ticket.motivo_espera,
      motivo_cancelacion: ticket.motivo_cancelacion,
      f_asignacion: ticket.f_asignacion,
      f_inicio: ticket.f_inicio,
      f_resolucion: ticket.f_resolucion,
      f_validacion: ticket.f_validacion,
      f_espera_desde: ticket.f_espera_desde,
      fecha_plan: ticket.fecha_plan,
      campo_adicional: ticket.problema?.campo_adicional ?? null,
      min_campo: Math.round(segundosCampo / 60),
      equipo: equipo.map((e) => ({
        usuario_id: e.usuario_id,
        nombre: e.usuario?.nombre ?? '—',
        papel: e.papel,
      })),
      sesiones: sesiones.map((s) => ({
        id: s.id,
        inicio: s.inicio,
        fin: s.fin,
        motivo: s.motivo,
        segundos: Math.round(
          ((s.fin ? new Date(s.fin).getTime() : Date.now()) - new Date(s.inicio).getTime()) / 1000,
        ),
        en_sitio: s.en_sitio,
        distancia_m: s.distancia_m,
        exactitud: s.exactitud_inicio,
        sede_esperada: s.sede_esperada?.nombre ?? null,
        motivo_sin_ubicacion: s.motivo_sin_ubicacion,
      })),
      bitacora: bitacora.map((b) => ({
        id: b.id,
        fecha: b.fecha,
        accion: b.accion,
        detalle: b.detalle,
        motivo: b.motivo,
        valor_antes: b.valor_antes,
        valor_nuevo: b.valor_nuevo,
        usuario: b.usuario_nombre ?? b.usuario?.nombre ?? 'Sistema',
      })),
    };
  }

  private async conteoSesiones(ids: number[]): Promise<Map<number, number>> {
    if (!ids.length) return new Map();
    const filas = await this.sesiones.findAll({
      attributes: ['ticket_id', [Sequelize.fn('COUNT', Sequelize.col('id')), 'n']],
      where: { ticket_id: { [Op.in]: ids } },
      group: ['ticket_id'],
      raw: true,
    });
    return new Map(filas.map((f: any) => [Number(f.ticket_id), Number(f.n)]));
  }

  private resumen(
    t: Ticket,
    objetivos: Map<string, number>,
    sesiones: number,
    mapaDependenciasSaf: Map<number, string>,
  ) {
    const objetivo = objetivos.get(t.prioridad) ?? 1440;
    return {
      id: t.id,
      folio: t.folio,
      /** Fijo desde el registro, el mismo sin importar el servicio; folio puede diferir hasta el cierre. */
      folio_general: t.folio_general,
      servicio_id: t.servicio_id,
      servicio: t.servicio?.nombre ?? '—',
      servicio_clave: t.servicio?.clave ?? '',
      servicio_original: t.servicio_original?.nombre ?? '—',
      problema_id: t.problema_id,
      problema: t.problema?.descripcion ?? 'Sin clasificar',
      problema_clave: t.problema?.clave ?? '',
      campo_adicional: t.problema?.campo_adicional ?? null,
      prioridad: t.prioridad,
      estatus: t.estatus,
      contexto: t.contexto,
      color_toner: t.color_toner,
      modelo_traslado: t.modelo_traslado,
      solicitante_id: t.solicitante_id,
      solicitante: t.solicitante_nombre ?? t.solicitante?.nombre ?? '—',
      /** Solo trae valor cuando alguien registro el ticket a nombre de otro. */
      registrado_por: t.registrado_por,
      registrado_por_nombre: t.registrado_por_nombre,
      /** Solo aplica a servicio CMP: como termino la atencion del equipo. */
      resultado_cmp: t.resultado_cmp,
      tiene_dictamen: !!t.dictamen_url,
      tiene_cedula_salida: !!t.cedula_salida_url,
      tiene_cedula_entrada: !!t.cedula_entrada_url,
      dependencia: (t.dependencia_id && mapaDependenciasSaf.get(t.dependencia_id)) ?? '—',
      area: t.area?.nombre ?? '—',
      /* Los ids los usa el formulario de correccion para preseleccionar. */
      dependencia_id: t.dependencia_id,
      area_id: t.area_id,
      extension: t.extension,
      edificio_atencion: t.edificio_atencion,
      inmueble_id: t.inmueble_id,
      piso: t.piso,
      /** Solo servicio CNA: dia y hora en que el tecnico puede ir a revisar los bienes. */
      hora_atencion: t.hora_atencion,
      /** Solo servicio IMPA: tecnico externo (proveedor) que atendio, capturado al resolver. */
      tecnico_externo_id: t.tecnico_externo_id,
      tecnico_externo: t.tecnico_externo?.nombre ?? null,
      sede: t.sede?.nombre ?? null,
      tecnico_id: t.tecnico_id,
      tecnico: t.tecnico?.nombre ?? null,
      interno: t.interno,
      f_registro: t.f_registro,
      pendiente_validacion: t.pendiente_validacion,
      f_captura: t.f_captura,
      validado_por_nombre: t.validado_por_nombre,
      motivo_rechazo_validacion: t.motivo_rechazo_validacion,
      datos_copiados: t.datos_copiados,
      en_cola: t.en_cola,
      escalado: t.escalado,
      reclasificado: t.reclasificado,
      cierre_por_omision: t.cierre_por_omision,
      reasignaciones: t.reasignaciones,
      reaperturas: t.reaperturas,
      rechazos: t.rechazos,
      sesiones: sesiones,
      min_ciclo: ReglasService.minutosCiclo(t),
      min_activo: ReglasService.minutosActivos(t),
      /* Mismo criterio que minutosActivos(): solo jornada laboral, para que
         coincida con lo que de verdad se le descuenta al ticket. */
      min_espera: Math.round(
        t.espera_acum_seg / 60 +
          (t.f_espera_desde ? minutosHabiles(new Date(t.f_espera_desde), new Date()) : 0),
      ),
      minutos_objetivo: objetivo,
      vencido: ReglasService.vencido(t, objetivo),
    };
  }

  /* ==================================================================
     §2 · alta del solicitante
     ================================================================== */

  /**
   * Datos de quien registra el ticket. Si tiene fila local (staff, o un
   * solicitante que ya se registro antes) salen de ahi, igual que siempre.
   * Si es un solicitante externo (usuario.externo) salen de saf.s_usuario:
   * no hay fila local que consultar. area_id y sede_id quedan en null para
   * el externo porque el catalogo de departamentos de saf no empata limpio
   * con el de areas de aqui; dependencia_id si se resuelve por nombre.
   */
  private async resolverQuien(usuario: UsuarioToken): Promise<{
    nombre: string;
    dependencia_id: number | null;
    area_id: number | null;
    sede_id: number | null;
    extension: string | null;
  }> {
    if (!usuario.externo) {
      const quien = await this.usuarios.findByPk(usuario.id);
      if (!quien) throw new ForbiddenException('Sesion invalida');
      /*
       * area_id (y por lo tanto sede_id) es, a diferencia de dependencia_id,
       * un dato que ESTRUCTURALMENTE nunca se llena: UsuariosService.registrar()
       * siempre lo crea en null y nunca se edita despues (sin pantalla ni campo
       * para capturarlo). No es un dato desactualizado que se pueda corregir
       * resolviendolo via saf en vivo, como se hizo con dependencia_id: saf no
       * tiene un catalogo geocodificado (lat/long) equivalente a la tabla local
       * Sede — lo mas parecido (s_usuario.id_Departamento -> t_ubicacion) es
       * solo una direccion en texto libre, sin coordenadas. Por eso
       * sede_id (usado por RelojService para el geofencing del checador) rara
       * vez trae un valor: queda como verificacion best-effort, por diseno,
       * hasta que se decida capturar la sede a mano al registrar el ticket o
       * armar un catalogo propio que mapee saf a Sede.
       */
      const area = quien.area_id ? await this.areas.findByPk(quien.area_id) : null;
      /* La dependencia siempre sale de saf (s_usuario.id_Dependencia, cruzando
         por rfc), y se guarda tal cual (id de saf, no de la tabla local, que
         quedo deprecada): Usuario.dependencia_id es solo la foto del alta y
         nunca se usa, ni como respaldo — si no se puede identificar en saf
         (sin rfc, o sin match), queda en null. */
      const dependenciaSaf = await this.dependenciaSafDeGestor(quien.id);
      return {
        nombre: quien.nombre,
        dependencia_id: dependenciaSaf,
        area_id: quien.area_id,
        sede_id: area?.sede_id ?? null,
        extension: quien.extension,
      };
    }

    const datos = await this.datosSaf(usuario.id);
    if (!datos) throw new ForbiddenException('Sesion invalida');
    return { ...datos, area_id: null, sede_id: null, extension: null };
  }

  /**
   * Nombre de cada dependencia de saf por su id (saf.t_dependencia), para
   * mostrar junto al ticket sin volver a consultar por cada fila — la tabla
   * es chica (una decena de filas) y estatica, se trae entera de un jalon.
   */
  private async mapaDependenciasSaf(): Promise<Map<number, string>> {
    const todas = await this.sDependencias.findAll();
    return new Map(todas.map((d) => [d.id_Dependencia, d.Nombre.trim()]));
  }

  /**
   * Nombre y dependencia de un usuario activo de saf, dado su id_Usuario.
   * Se usa tanto para la sesion del solicitante externo (§2) como para que
   * el administrador registre un ticket a nombre de otro usuario activo.
   */
  private async datosSaf(
    idUsuarioSaf: number,
    incluirBajas = false,
  ): Promise<{ nombre: string; dependencia_id: number | null } | null> {
    const sUsuario = await this.sUsuarios.findByPk(idUsuarioSaf);
    if (!sUsuario || (!incluirBajas && sUsuario.Estado !== 1)) return null;
    return {
      nombre: sUsuario.Nombre,
      dependencia_id: sUsuario.id_Dependencia,
    };
  }

  /**
   * Dependencia (id de saf) de un usuario local, cruzando su rfc contra
   * saf.s_usuario.N_Usuario. Se usa para saber a que dependencia pertenece
   * un gestor, y limitarlo a registrar solo a nombre de gente de esa misma
   * dependencia. Sin rfc (o sin match en saf) no se le puede identificar
   * dependencia, asi que no se le ofrece nadie: es el default seguro.
   */
  /**
   * Gestor "general" (usuario.registra_cualquier_dependencia): registra a
   * nombre de gente de cualquier dependencia, sin el candado de "su misma
   * dependencia". Solo aplica al rol gestor.
   */
  private async registraCualquierDependencia(usuario: UsuarioToken): Promise<boolean> {
    if (usuario.rol !== 'gestor' || usuario.externo) return false;
    const u = await this.usuarios.findByPk(usuario.id, { attributes: ['registra_cualquier_dependencia'] });
    return !!u?.registra_cualquier_dependencia;
  }

  private async dependenciaSafDeGestor(usuarioId: number): Promise<number | null> {
    const local = await this.usuarios.findByPk(usuarioId);
    if (!local?.rfc) return null;
    const sUsuario = await this.sUsuarios.findOne({ where: { N_Usuario: local.rfc } });
    return sUsuario?.id_Dependencia ?? null;
  }

  /**
   * Busqueda de usuarios activos de saf para que admin/operador/gestor elijan
   * a nombre de quien registran un ticket. A diferencia de
   * UsuariosService.buscarSaf (que excluye a quien ya tiene rol asignado,
   * porque es para dar de alta personal) aqui no se excluye a nadie: cualquier
   * activo puede ser solicitante. El gestor solo ve gente de su misma
   * dependencia (saf); admin y operador ven a todos.
   */
  async buscarSolicitantes(q: string, usuario: UsuarioToken, servicioId?: number) {
    const texto = q.trim();
    if (texto.length < 3) return [];

    const servicio = servicioId ? await this.serviciosM.findByPk(servicioId) : null;
    const incluirBajas = SERVICIOS_ACEPTAN_BAJAS.includes(servicio?.clave ?? '');
    const where: Record<string, unknown> = { Nombre: { [Op.like]: `%${texto}%` } };
    if (!incluirBajas) where.Estado = 1;
    if (
      (usuario.rol === 'gestor' || usuario.rol === 'validador') &&
      !(await this.registraCualquierDependencia(usuario))
    ) {
      const dependenciaSaf = await this.dependenciaSafDeGestor(usuario.id);
      if (!dependenciaSaf) return [];
      where.id_Dependencia = dependenciaSaf;
    }

    const candidatos = await this.sUsuarios.findAll({
      where,
      order: [['Nombre', 'ASC']],
      limit: 20,
    });

    const mapaDependencias = await this.mapaDependenciasSaf();
    const resultado: {
      id_usuario_saf: number;
      nombre: string;
      rfc: string;
      dependencia_id: number | null;
      dependencia: string | null;
      activo: boolean;
    }[] = [];
    for (const s of candidatos) {
      resultado.push({
        id_usuario_saf: s.id_Usuario,
        nombre: s.Nombre,
        rfc: s.N_Usuario,
        activo: s.Estado === 1,
        dependencia_id: s.id_Dependencia,
        dependencia: s.id_Dependencia ? (mapaDependencias.get(s.id_Dependencia) ?? null) : null,
      });
    }
    return resultado;
  }

  async crear(dto: CrearTicketDto, usuario: UsuarioToken) {
    const problema = await this.problemas.findOne({
      where: { clave: dto.problema, activo: true },
      include: [Servicio],
    });
    if (!problema) throw new BadRequestException('El problema no existe en el catalogo');
    if (problema.servicio.origen !== 'usuario') {
      throw new ForbiddenException('Ese tipo de trabajo solo lo genera el administrador');
    }

    /*
     * Servicio restringido (ver ServicioUsuarioPermitido, administrable desde
     * el catalogo): solo la gente en esa lista, mas el administrador.
     */
    if (problema.servicio.restringido && usuario.rol !== 'admin') {
      const rfc = await this.rfcDelSolicitante(usuario.id, usuario.nombre);
      const permitido = rfc
        ? await this.permitidosServicio.findOne({
            where: { servicio_id: problema.servicio_id, rfc },
          })
        : null;
      if (!permitido) {
        throw new ForbiddenException('Tu perfil no puede registrar tickets de ese servicio');
      }
      /* Por default, aunque este en la lista, ahi solo se registra a nombre
         propio — salvo que el servicio lo tenga habilitado explicitamente. */
      if (dto.a_nombre_de && !problema.servicio.permite_a_nombre_de) {
        throw new ForbiddenException('Ese servicio no se puede registrar a nombre de otro usuario');
      }
    }

    if (problema.requiere_texto && !dto.texto?.trim()) {
      throw new BadRequestException('La opcion «Otro» exige capturar la descripcion');
    }
    if (CLAVES_TONER.includes(problema.clave) && !dto.color_toner?.trim()) {
      throw new BadRequestException('Indica que color de toner se va a cambiar');
    }
    if (problema.clave === 'IMPA-09' && !dto.modelo_traslado?.trim()) {
      throw new BadRequestException('Indica que modelo de impresora se va a trasladar');
    }
    if (problema.servicio.clave === 'CNA' && !dto.hora_atencion) {
      throw new BadRequestException('Indica el dia y la hora en que el tecnico puede ir a revisar los bienes');
    }

    /* El campo adicional del catalogo. Si pide cuenta de correo se valida aqui
       con la misma regla que la correccion de datos generales. */
    let contexto = dto.contexto?.trim() || null;
    if (esCampoCuentaCorreo(problema.campo_adicional)) {
      const revision = revisaCuentaCorreo(
        contexto,
        dto.correo_libre ? '' : dominioInstitucional(this.config.get('CORREO_DOMINIO')),
      );
      if ('error' in revision) throw new BadRequestException(revision.error);
      contexto = revision.correo;
    }

    /*
     * §2 a nombre de otro usuario: solo admin/operador/gestor pueden mandar
     * a_nombre_de, y solo con un usuario activo de saf. El id que queda en
     * solicitante_id vive en el espacio de ids de saf (igual que el
     * solicitante externo de siempre), por eso el nombre se denormaliza en
     * solicitante_nombre en vez de confiar en el join. registrado_por deja
     * rastro de quien lo dio de alta realmente (siempre un usuario.id local).
     */
    const ROLES_A_NOMBRE_DE = ['admin', 'operador', 'gestor', 'validador', 'sistemas'];
    let quien: {
      nombre: string;
      dependencia_id: number | null;
      area_id: number | null;
      sede_id: number | null;
      extension: string | null;
    };
    let solicitanteId: number;
    let registradoPor: number | null = null;
    let registradoPorNombre: string | null = null;

    if (dto.a_nombre_de) {
      if (!ROLES_A_NOMBRE_DE.includes(usuario.rol)) {
        throw new ForbiddenException(
          'Tu perfil no puede registrar un ticket a nombre de otro usuario',
        );
      }
      if (usuario.rol !== 'admin') {
        const local = await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] });
        if (local?.rfc && RFC_SIEMPRE_A_NOMBRE_PROPIO.includes(local.rfc)) {
          throw new ForbiddenException('Tu perfil siempre registra el ticket a tu propio nombre');
        }
      }
      const datos = await this.datosSaf(
        dto.a_nombre_de,
        SERVICIOS_ACEPTAN_BAJAS.includes(problema.servicio.clave),
      );
      if (!datos) throw new BadRequestException('Ese usuario no existe o ya no esta activo en saf');

      /* El gestor (y el validador, que ve lo mismo) solo registra a nombre de gente de su misma dependencia (saf). */
      if (
        (usuario.rol === 'gestor' || usuario.rol === 'validador') &&
        !(await this.registraCualquierDependencia(usuario))
      ) {
        const [dependenciaGestor, sUsuarioObjetivo] = await Promise.all([
          this.dependenciaSafDeGestor(usuario.id),
          this.sUsuarios.findByPk(dto.a_nombre_de),
        ]);
        if (!dependenciaGestor || sUsuarioObjetivo?.id_Dependencia !== dependenciaGestor) {
          throw new ForbiddenException(
            'Solo puedes registrar tickets a nombre de alguien de tu misma dependencia',
          );
        }
      }

      quien = { ...datos, area_id: null, sede_id: null, extension: null };
      solicitanteId = dto.a_nombre_de;
      registradoPor = usuario.id;
      registradoPorNombre = usuario.nombre;
    } else {
      quien = await this.resolverQuien(usuario);
      solicitanteId = usuario.id;
    }

    /*
     * §16 validacion previa (rol validador, ver DependenciaValidador): solo
     * pasan por aqui los tickets que registra un gestor CUYA PROPIA
     * dependencia de saf (s_usuario.id_Dependencia, no la del solicitante)
     * es la 3 — es la unica dependencia con validador asignado. El ticket
     * queda congelado —sin tecnico, sin SLA corriendo— hasta que un
     * validador lo revise.
     *
     * CNA (Cartas de no adeudo) queda fuera aparte: SASA920502 lo registra a
     * nombre de solicitantes de cualquier dependencia (ver
     * USUARIOS_CIERRE_SERVICIO) — es un flujo cerrado donde ella misma
     * confirma el cierre al final, la validacion previa no aplica.
     */
    const requiereValidacion =
      problema.servicio.clave !== 'CNA' &&
      usuario.rol === 'gestor' &&
      (await this.dependenciaSafDeGestor(usuario.id)) === 3;

    /*
     * §16 el inmueble que el usuario eligio al registrar es mas preciso que
     * el area del solicitante para saber donde va a estar el tecnico: si
     * tiene sede capturada, manda sobre la que resolvio resolverQuien().
     */
    const sedeId = dto.inmueble_id
      ? ((await this.inmuebles.findByPk(dto.inmueble_id, { attributes: ['sede_id'] }))?.sede_id ??
        quien.sede_id)
      : quien.sede_id;

    /*
     * Doble clic, recarga de pagina o reintento del navegador con mala
     * señal: sin esto, cada click de mas crea un ticket identico (ya paso
     * dos veces, una vez 60 seguidos). Si el mismo solicitante ya registro
     * EXACTAMENTE el mismo problema+contexto hace menos de 2 minutos, se
     * corta aqui en vez de dejar pasar el duplicado.
     */
    const duplicado = await this.tickets.findOne({
      where: {
        solicitante_id: solicitanteId,
        problema_id: problema.id,
        contexto,
        f_captura: { [Op.gte]: new Date(Date.now() - 2 * 60_000) },
      },
      order: [['f_captura', 'DESC']],
    });
    if (duplicado) {
      throw new ConflictException(
        `Ya registraste este mismo reporte hace un momento (folio ${duplicado.folio_general}). ` +
          'Si de verdad necesitas otro, espera un par de minutos e inténtalo de nuevo.',
      );
    }

    const ticket = await this.db.transaction(async (tx) => {
      /*
       * El folio por servicio (TK/CMP/N, TK/TEL/N…) se asigna hasta que el
       * ticket cierra de verdad (ver ReglasService.asignaFolioDeCierre). En
       * lo que tanto, el ticket se identifica con el folio general
       * (TK/DI/N, o TK/OSF/N para OSFEM), el mismo para cualquier servicio.
       */
      const folio = await this.reglas.siguienteFolioGeneral(tx, quien.dependencia_id);

      const t = await this.tickets.create(
        {
          folio,
          folio_general: folio,
          servicio_id: problema.servicio_id,
          servicio_original_id: problema.servicio_id,
          problema_id: problema.id,
          /* §4 la prioridad la impone el catalogo. El usuario no la elige. */
          prioridad: problema.prioridad,
          estatus: ESTATUS.REGISTRADO,
          solicitante_id: solicitanteId,
          solicitante_nombre: quien.nombre,
          registrado_por: registradoPor,
          registrado_por_nombre: registradoPorNombre,
          dependencia_id: quien.dependencia_id,
          area_id: quien.area_id,
          sede_id: sedeId,
          extension: dto.extension?.trim() || quien.extension,
          edificio_atencion: dto.edificio_atencion?.trim() || null,
          inmueble_id: dto.inmueble_id ?? null,
          piso: dto.piso?.trim() || null,
          hora_atencion: problema.servicio.clave === 'CNA' ? new Date(dto.hora_atencion!) : null,
          contexto,
          color_toner: CLAVES_TONER.includes(problema.clave) ? dto.color_toner!.trim() : null,
          modelo_traslado: problema.clave === 'IMPA-09' ? dto.modelo_traslado!.trim() : null,
          texto_libre: problema.requiere_texto ? dto.texto!.trim() : null,
          pendiente_validacion: requiereValidacion,
          f_captura: new Date(),
          f_registro: requiereValidacion ? null : new Date(),
        },
        { transaction: tx },
      );

      await this.reglas.anota(
        t.id,
        usuario.id,
        'Registro',
        `${problema.servicio.nombre} · ${problema.descripcion}` +
          (dto.a_nombre_de ? ` (registrado por ${usuario.nombre} a nombre de ${quien.nombre})` : ''),
        tx,
        undefined,
        dto.a_nombre_de ? usuario.nombre : quien.nombre,
      );
      this.traza.registra(
        '§2',
        dto.a_nombre_de
          ? `Ticket ${folio} registrado por ${usuario.nombre} a nombre de ${quien.nombre} · ${problema.descripcion}.`
          : `Ticket ${folio} registrado por ${quien.nombre} · ${problema.descripcion}.`,
      );
      this.traza.registra(
        '§4',
        `Prioridad ${problema.prioridad} asignada por catalogo (${problema.clave}). El usuario no la eligio.`,
      );

      if (requiereValidacion) {
        await this.reglas.anota(
          t.id,
          usuario.id,
          'Pendiente de validacion',
          'Este ticket requiere revision de un validador antes de turnarse a tecnico.',
          tx,
        );
        this.traza.registra('§16', `Ticket ${folio} queda pendiente de validacion.`);
      } else {
        await this.reglas.revisaEscalamiento(t, tx);
        await this.reglas.asignar(t, tx);
      }
      return t;
    });

    return this.detalle(ticket.id, usuario);
  }

  /* ==================================================================
     §16 · validacion previa (rol validador)
     ================================================================== */

  /** Dependencias que este usuario valida. Vacio si no tiene ninguna asignada. */
  private async dependenciasDe(usuarioId: number): Promise<number[]> {
    const filas = await this.dependenciaValidador.findAll({ where: { usuario_id: usuarioId } });
    return filas.map((f) => f.dependencia_id);
  }

  /** Servicios que este validador puede autorizar. Vacio = sin restriccion (autoriza todos). */
  private async serviciosQueValida(usuarioId: number): Promise<number[]> {
    const filas = await this.servicioValidador.findAll({ where: { usuario_id: usuarioId } });
    return filas.map((f) => f.servicio_id);
  }

  /**
   * Dependencia (id de saf) que un gestor atiende: no es Usuario.dependencia_id
   * (esa es donde el gestor mismo trabaja), sino la dependencia de la gente a
   * la que registra tickets — el mismo calculo que ya limita a quien puede
   * buscar en buscarSolicitantes(). Vacio si no se le puede identificar (sin
   * rfc o sin match en saf).
   */
  private async dependenciasDelGestor(usuarioId: number): Promise<number[]> {
    const idSaf = await this.dependenciaSafDeGestor(usuarioId);
    return idSaf ? [idSaf] : [];
  }

  /** Bandeja del validador: tickets pendientes de las dependencias (y, si aplica, servicios) que tiene asignados. */
  async porValidar(usuario: UsuarioToken) {
    const dependenciaIds = await this.dependenciasDe(usuario.id);
    if (!dependenciaIds.length) return [];

    const where: Record<string, unknown> = {
      pendiente_validacion: true,
      dependencia_id: { [Op.in]: dependenciaIds },
    };
    const servicioIds = await this.serviciosQueValida(usuario.id);
    if (servicioIds.length) where.servicio_id = { [Op.in]: servicioIds };

    const filas = await this.tickets.findAll({
      where,
      include: INCLUDES,
      order: [['f_captura', 'ASC']],
    });
    const objetivos = await this.reglas.objetivos();
    const mapaDependencias = await this.mapaDependenciasSaf();
    /* texto_libre no viene en resumen() (solo en detalle()): el validador
       necesita verlo de una vez en la tarjeta, sin tener que abrir el
       detalle del ticket. */
    return filas.map((t) => ({
      ...this.resumen(t, objetivos, 0, mapaDependencias),
      texto_libre: t.texto_libre,
    }));
  }

  /**
   * Lo que un gestor registro y sigue (o quedo) en validacion. El folio ya
   * existe desde que se capturo (ver crear()), aunque mientras no se apruebe
   * no cuenta el tiempo de atencion ni se turna a tecnico — por eso se
   * expone aqui, para que el gestor lo tenga a la mano desde ya.
   */
  async misPorValidar(usuario: UsuarioToken) {
    const filas = await this.tickets.findAll({
      where: {
        [Op.and]: [
          { [Op.or]: [{ solicitante_id: usuario.id }, { registrado_por: usuario.id }] },
          {
            [Op.or]: [
              { pendiente_validacion: true },
              { motivo_rechazo_validacion: { [Op.ne]: null } },
            ],
          },
        ],
      },
      include: INCLUDES,
      order: [['f_captura', 'DESC']],
    });
    return filas.map((t) => ({
      id: t.id,
      folio: t.folio,
      problema: t.problema?.descripcion ?? 'Sin clasificar',
      servicio: t.servicio?.nombre ?? '—',
      contexto: t.contexto,
      edificio_atencion: t.edificio_atencion,
      f_captura: t.f_captura,
      pendiente_validacion: t.pendiente_validacion,
      motivo_rechazo_validacion: t.motivo_rechazo_validacion,
    }));
  }

  private async ticketPendienteDeMiDependencia(id: number, usuario: UsuarioToken): Promise<Ticket> {
    const t = await this.tickets.findByPk(id);
    if (!t) throw new NotFoundException('El ticket no existe');
    if (!t.pendiente_validacion) {
      throw new BadRequestException('Ese ticket ya no esta pendiente de validacion');
    }
    const dependenciaIds = await this.dependenciasDe(usuario.id);
    if (!t.dependencia_id || !dependenciaIds.includes(t.dependencia_id)) {
      throw new ForbiddenException('No validas tickets de esa dependencia');
    }
    const servicioIds = await this.serviciosQueValida(usuario.id);
    if (servicioIds.length && !servicioIds.includes(t.servicio_id)) {
      throw new ForbiddenException('No validas tickets de ese tipo de servicio');
    }
    return t;
  }

  async aprobarValidacion(id: number, usuario: UsuarioToken) {
    const t = await this.ticketPendienteDeMiDependencia(id, usuario);

    await this.db.transaction(async (tx) => {
      await t.update(
        {
          pendiente_validacion: false,
          f_registro: new Date(),
          validado_por: usuario.id,
          validado_por_nombre: usuario.nombre,
        },
        { transaction: tx },
      );
      await this.reglas.anota(
        t.id,
        usuario.id,
        'Validado',
        'El ticket paso la revision y entra al flujo normal.',
        tx,
      );
      await this.reglas.revisaEscalamiento(t, tx);
      await this.reglas.asignar(t, tx);
    });
    this.traza.registra('§16', `Ticket ${t.folio} validado por ${usuario.nombre}.`);

    /* No this.detalle(id, usuario): el validador deja de tener alcance sobre
       el ticket en cuanto deja de estar pendiente (su alcance es el mismo
       que el de un gestor, por solicitante_id/registrado_por). */
    return { id: t.id };
  }

  async rechazarValidacion(id: number, motivo: string, usuario: UsuarioToken) {
    const t = await this.ticketPendienteDeMiDependencia(id, usuario);
    const limpio = motivo.trim();
    if (!limpio) throw new BadRequestException('Indica el motivo del rechazo');

    await t.update({
      pendiente_validacion: false,
      estatus: ESTATUS.CANCELADO,
      f_cancelacion: new Date(),
      motivo_cancelacion: limpio,
      motivo_rechazo_validacion: limpio,
      validado_por: usuario.id,
      validado_por_nombre: usuario.nombre,
    });
    await this.reglas.anota(t.id, usuario.id, 'Rechazado en validacion', limpio);
    this.traza.registra('§16', `Ticket ${t.folio} rechazado en validacion por ${usuario.nombre}: ${limpio}`);

    return { id: t.id };
  }

  /* ==================================================================
     Correccion de los datos generales del reporte

     Es lo unico que el solicitante puede tocar despues del alta. El ticket en
     si —problema, servicio, prioridad, tecnico— no se mueve por aqui: para eso
     estan reclasificar, prioridad y reasignar, que piden motivo y otro rol.
     ================================================================== */

  /**
   * Corrige a nombre de quien quedo el ticket (p. ej. el gestor escribio el
   * nombre pero no eligio a nadie y quedo a su propio nombre). Lo puede hacer
   * el admin/operador, o el gestor sobre los tickets que el mismo registro,
   * con las mismas reglas que al registrar "a nombre de": persona activa de
   * saf y, para el gestor, de su misma dependencia. El folio no cambia (es
   * inmutable) y el cambio queda en la bitacora con el antes y el despues.
   */
  async cambiarSolicitante(id: number, dto: CambiarSolicitanteDto, usuario: UsuarioToken) {
    if (!['admin', 'operador', 'gestor', 'sistemas'].includes(usuario.rol)) {
      throw new ForbiddenException('Tu perfil no puede cambiar el solicitante de un ticket');
    }
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcanceTicket(usuario)) },
      include: [{ model: Servicio, as: 'servicio' }],
    });
    if (!ticket) throw new NotFoundException('El ticket no existe o no esta a tu alcance');
    /*
     * "Sistemas" es la unica excepcion: sus tickets de SISTEMAS/PROGRESS se
     * cierran solos casi al instante (ver cierreInmediato en resolver()),
     * asi que en la practica siempre los va a encontrar ya cerrados — sin
     * esta excepcion nunca podria corregir un error de captura. Gestor y
     * admin se quedan con la regla de siempre: nada de tickets cerrados.
     */
    if (usuario.rol !== 'sistemas' && ESTATUS_FINALES.includes(ticket.estatus)) {
      throw new BadRequestException('El ticket ya esta cerrado o cancelado: el solicitante no se cambia');
    }

    /* Igual que el gestor: "sistemas" (Castañeda, SISTEMAS/PROGRESS) solo
       corrige lo que el mismo registro, no cualquier ticket de su alcance
       (que para el es lo turnado como tecnico). */
    if (usuario.rol === 'gestor' || usuario.rol === 'sistemas') {
      const loRegistro =
        ticket.registrado_por === usuario.id ||
        (ticket.solicitante_id === usuario.id && ticket.solicitante_nombre === usuario.nombre);
      if (!loRegistro) {
        throw new ForbiddenException('Solo puedes cambiar el solicitante de los tickets que tu registraste');
      }
      if (dto.a_nombre_de) {
        if (ticket.servicio?.restringido && !ticket.servicio.permite_a_nombre_de) {
          throw new ForbiddenException('Ese servicio no se puede registrar a nombre de otro usuario');
        }
        const local = await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] });
        if (local?.rfc && RFC_SIEMPRE_A_NOMBRE_PROPIO.includes(local.rfc)) {
          throw new ForbiddenException('Tu perfil siempre registra el ticket a tu propio nombre');
        }
      }
    }

    let quien: { nombre: string; dependencia_id: number | null };
    let solicitanteId: number;
    let registradoPor: number | null;
    let registradoPorNombre: string | null;

    if (dto.a_nombre_de) {
      const datos = await this.datosSaf(
        dto.a_nombre_de,
        SERVICIOS_ACEPTAN_BAJAS.includes(ticket.servicio?.clave ?? ''),
      );
      if (!datos) throw new BadRequestException('Ese usuario no existe o ya no esta activo en saf');
      if (usuario.rol === 'gestor' && !(await this.registraCualquierDependencia(usuario))) {
        const [dependenciaGestor, sUsuarioObjetivo] = await Promise.all([
          this.dependenciaSafDeGestor(usuario.id),
          this.sUsuarios.findByPk(dto.a_nombre_de),
        ]);
        if (!dependenciaGestor || sUsuarioObjetivo?.id_Dependencia !== dependenciaGestor) {
          throw new ForbiddenException(
            'Solo puedes registrar tickets a nombre de alguien de tu misma dependencia',
          );
        }
      }
      quien = datos;
      solicitanteId = dto.a_nombre_de;
      /* Quien lo dio de alta de verdad se conserva; si no habia (estaba a
         nombre propio), queda quien hace la correccion. */
      registradoPor = ticket.registrado_por ?? usuario.id;
      registradoPorNombre = ticket.registrado_por_nombre ?? usuario.nombre;
    } else {
      const propio = await this.resolverQuien(usuario);
      quien = { nombre: propio.nombre, dependencia_id: propio.dependencia_id };
      solicitanteId = usuario.id;
      registradoPor = null;
      registradoPorNombre = null;
    }

    if (solicitanteId === ticket.solicitante_id && quien.nombre === ticket.solicitante_nombre) {
      throw new BadRequestException('Esa persona ya es el solicitante del ticket');
    }

    const anterior = ticket.solicitante_nombre ?? '—';
    await this.db.transaction(async (tx) => {
      await ticket.update(
        {
          solicitante_id: solicitanteId,
          solicitante_nombre: quien.nombre,
          dependencia_id: quien.dependencia_id,
          registrado_por: registradoPor,
          registrado_por_nombre: registradoPorNombre,
        },
        { transaction: tx },
      );
      /* Sin detalle: la accion ya dice "Cambio de solicitante" y
         valor_antes/valor_nuevo ya pintan el "antes → nuevo" solos (ver
         detalleBitacora() en el frontend) — mandarlo tambien en detalle
         lo duplicaba en pantalla. */
      await this.reglas.anota(
        ticket.id,
        usuario.id,
        'Cambio de solicitante',
        undefined,
        tx,
        { antes: anterior.slice(0, 80), nuevo: quien.nombre.slice(0, 80) },
        usuario.nombre,
      );
    });

    return this.detalle(ticket.id, usuario);
  }

  async actualizarDatos(id: number, dto: DatosGeneralesDto, usuario: UsuarioToken) {
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcanceTicket(usuario)) },
      include: INCLUDES,
    });
    if (!ticket) throw new NotFoundException('El ticket no existe o no esta a tu alcance');

    const suyo = ticket.solicitante_id === usuario.id;
    if (!suyo && usuario.rol !== 'admin') {
      throw new ForbiddenException('Solo quien levanto el reporte o el administrador lo corrigen');
    }
    if (ESTATUS_FINALES.includes(ticket.estatus)) {
      throw new BadRequestException('El ticket ya esta cerrado o cancelado: sus datos no se tocan');
    }
    /*
     * Solo se corrige mientras el tecnico tiene el ticket en espera: evita
     * pisar un cambio de bien mientras se esta atendiendo activamente.
     */
    if (ticket.estatus !== ESTATUS.EN_ESPERA) {
      throw new BadRequestException('El ticket debe estar en espera para corregir sus datos');
    }

    /* Cada cambio se anota por separado: la bitacora guarda antes y despues. */
    const cambios: { campo: string; antes: string; nuevo: string }[] = [];
    const nuevos: Record<string, unknown> = {};
    const anota = (campo: string, antes: unknown, nuevo: unknown) => {
      cambios.push({ campo, antes: String(antes ?? '—'), nuevo: String(nuevo ?? '—') });
    };

    if (dto.contexto !== undefined) {
      let contexto = dto.contexto.trim() || null;
      if (esCampoCuentaCorreo(ticket.problema?.campo_adicional)) {
        const revision = revisaCuentaCorreo(
          contexto,
          dominioInstitucional(this.config.get('CORREO_DOMINIO')),
        );
        if ('error' in revision) throw new BadRequestException(revision.error);
        contexto = revision.correo;
      }
      if (contexto !== ticket.contexto) {
        anota(ticket.problema?.campo_adicional ?? 'Contexto', ticket.contexto, contexto);
        nuevos.contexto = contexto;
      }
    }

    if (dto.extension !== undefined) {
      const extension = dto.extension.trim() || null;
      if (extension !== ticket.extension) {
        anota('Extension', ticket.extension, extension);
        nuevos.extension = extension;
      }
    }

    if (dto.edificio_atencion !== undefined) {
      const edificioAtencion = dto.edificio_atencion.trim() || null;
      if (edificioAtencion !== ticket.edificio_atencion) {
        anota('Edificio o ubicacion', ticket.edificio_atencion, edificioAtencion);
        nuevos.edificio_atencion = edificioAtencion;
      }
    }

    if (!cambios.length) throw new BadRequestException('No hay ningun cambio que guardar');

    /* Antes de que ticket.update() lo pise, para el traspaso de custodia de abajo. */
    const contextoAnterior = ticket.contexto;

    await this.db.transaction(async (tx) => {
      await ticket.update(nuevos, { transaction: tx });
      for (const c of cambios) {
        /* El detalle nombra el campo; el antes y el despues van en su columna,
           que es como la pantalla de bitacora los presenta. */
        await this.reglas.anota(
          ticket.id,
          usuario.id,
          'Correccion de datos',
          c.campo,
          tx,
          { antes: c.antes.slice(0, 80), nuevo: c.nuevo.slice(0, 80) },
          usuario.nombre,
        );
      }
    });

    this.traza.registra(
      '§9',
      `${ticket.folio}: ${usuario.nombre} corrigio ${cambios.map((c) => c.campo).join(', ')}.`,
    );

    /*
     * Equipo de computo: si se cambio el numero de inventario y el tecnico ya
     * habia tomado el equipo anterior (esta EN ESPERA, asi que solo pudo pasar
     * si arranco el reloj antes de pausar), hay que regresarlo y tomar el
     * nuevo en su lugar — si no, el anterior se queda "atorado" en
     * mantenimiento en SIASAF y el nuevo nunca se marca como en atencion.
     */
    if (
      typeof nuevos.contexto === 'string' &&
      ticket.tecnico_id &&
      this.esTicketDeInventarioCmp(ticket)
    ) {
      await this.traspasaCustodiaCmp(ticket, contextoAnterior, nuevos.contexto);
    }

    return this.detalle(ticket.id, usuario);
  }

  /**
   * Regresa (si estaba en mantenimiento) el equipo anterior y toma el nuevo
   * en su lugar, a nombre del mismo tecnico — mismo mecanismo que
   * marcarCmpEnMantenimiento/atenderCmp. Best-effort: si algo falla, la
   * correccion de datos ya quedo guardada igual; solo se avisa en la traza.
   */
  private async traspasaCustodiaCmp(
    ticket: Ticket,
    contextoAnterior: string | null,
    contextoNuevo: string,
  ): Promise<void> {
    const [tecnicoLocal, rfcSolicitante] = await Promise.all([
      this.usuarios.findByPk(ticket.tecnico_id!, { attributes: ['rfc'] }),
      this.rfcDelSolicitante(ticket.solicitante_id, ticket.solicitante_nombre),
    ]);
    if (!tecnicoLocal?.rfc || !rfcSolicitante) return;

    const { bienes } = await this.bienesSrv.porRfcCmp(rfcSolicitante);

    const anterior = contextoAnterior ? bienes.find((b) => b.inventario === contextoAnterior) : null;
    if (anterior?.id && anterior.en_mantenimiento) {
      const cierre = await this.bienesSrv.finalizarMantenimiento(anterior.id, tecnicoLocal.rfc, anterior.esBc, {
        reparado: true,
      });
      if (!cierre.ok) {
        this.traza.registra(
          '§9',
          `${ticket.folio}: no se pudo regresar el equipo anterior (${contextoAnterior}) en SIASAF (${cierre.motivo}).`,
        );
      }
    }

    const nuevo = bienes.find((b) => b.inventario === contextoNuevo);
    if (nuevo?.id) {
      const inicio = await this.bienesSrv.iniciarMantenimiento(nuevo.id, tecnicoLocal.rfc, nuevo.esBc);
      if (!inicio.ok) {
        this.traza.registra(
          '§9',
          `${ticket.folio}: no se pudo marcar el nuevo equipo (${contextoNuevo}) en mantenimiento (${inicio.motivo}).`,
        );
      }
    }
  }

  /* ==================================================================
     §11 · alta de ticket interno del area
     ================================================================== */

  async crearInterno(dto: CrearInternoDto, usuario: UsuarioToken) {
    const problema = await this.problemas.findOne({
      where: { clave: dto.problema, activo: true },
      include: [Servicio],
    });
    if (!problema) throw new BadRequestException('La actividad no existe en el catalogo');
    if (problema.servicio.origen !== 'administrador') {
      throw new BadRequestException('Ese servicio no corresponde a trabajo interno del area');
    }

    const jefe = await this.usuarios.findOne({ where: { rol: 'jefe', activo: true } });
    const responsable = jefe?.id ?? usuario.id;

    const tecnicos = await this.usuarios.findAll({
      where: { id: { [Op.in]: dto.tecnicos }, activo: true, rol: { [Op.in]: ROLES_TECNICOS } },
    });
    if (!tecnicos.length) throw new BadRequestException('Ninguno de los tecnicos elegidos es valido');

    const ticket = await this.db.transaction(async (tx) => {
      const folio = await this.reglas.siguienteFolioGeneral(tx);

      const t = await this.tickets.create(
        {
          folio,
          folio_general: folio,
          servicio_id: problema.servicio_id,
          servicio_original_id: problema.servicio_id,
          problema_id: problema.id,
          prioridad: problema.prioridad,
          /* Nace asignado: nadie lo solicito, el area lo programo. */
          estatus: ESTATUS.ASIGNADO,
          solicitante_id: usuario.id,
          solicitante_nombre: usuario.nombre,
          tecnico_id: responsable,
          interno: true,
          fecha_plan: dto.fecha_plan ?? null,
          contexto: dto.alcance?.trim() || null,
          f_asignacion: new Date(),
        },
        { transaction: tx },
      );

      await this.equipos.create(
        { ticket_id: t.id, usuario_id: responsable, papel: 'responsable' },
        { transaction: tx },
      );
      for (const tec of tecnicos) {
        if (tec.id === responsable) continue;
        await this.equipos.create(
          { ticket_id: t.id, usuario_id: tec.id, papel: 'apoyo' },
          { transaction: tx },
        );
      }

      await this.reglas.anota(
        t.id,
        usuario.id,
        'Alta de ticket interno',
        `${tecnicos.length} tecnico(s) · responsable ${jefe?.nombre ?? usuario.nombre}`,
        tx,
      );
      this.traza.registra(
        '§11',
        `Ticket interno ${folio} (${problema.servicio.nombre}) con ${tecnicos.length} tecnico(s). ` +
          'No requiere validacion del usuario.',
      );
      return t;
    });

    return this.detalle(ticket.id, usuario);
  }

  /* ==================================================================
     Ciclo de vida (§5, §9, §10)
     ================================================================== */

  /** Carga el ticket verificando que el rol pueda siquiera verlo. */
  private async cargar(id: number, usuario: UsuarioToken): Promise<Ticket> {
    /*
     * Caso especial: quien cierra un servicio por USUARIOS_CIERRE_SERVICIO
     * (ver exigeSolicitante) necesita poder abrir CUALQUIER ticket de ese
     * servicio para cerrarlo, sin importar la dependencia — el alcance
     * normal de gestor (usado tambien por "Tickets generados") lo limitaria
     * a su propia dependencia, que no tiene nada que ver con esto.
     */
    if (Object.values(USUARIOS_CIERRE_SERVICIO).includes(usuario.id)) {
      const t = await this.tickets.findOne({
        where: { id },
        include: [{ model: Servicio, as: 'servicio' }],
      });
      if (t && USUARIOS_CIERRE_SERVICIO[t.servicio?.clave ?? ''] === usuario.id) return t;
    }
    const t = await this.tickets.findOne({
      where: { id, ...(await this.alcanceTicket(usuario)) },
      include: [{ model: Servicio, as: 'servicio' }],
    });
    if (!t) throw new NotFoundException('El ticket no existe o no esta a tu alcance');
    return t;
  }

  /**
   * rfc de quien solicito el ticket. solicitante_id no vive siempre en el
   * mismo espacio de ids (ver comentario en el modelo Ticket): puede ser un
   * usuario.id local o un id_Usuario de saf.s_usuario, y el numero puede
   * coincidir por pura casualidad con el de una persona distinta en el otro
   * espacio (p. ej. solicitante_id=4 es a la vez un usuario.id local real y
   * un id_Usuario de saf real, de dos personas que no tienen nada que ver).
   * Por eso no basta con "existe en la tabla local": se exige ademas que el
   * nombre coincida con solicitanteNombre (el mismo desempate que ya usa
   * alcance()) antes de confiar en esa fila local.
   */
  private async rfcDelSolicitante(
    solicitanteId: number,
    solicitanteNombre?: string | null,
  ): Promise<string | null> {
    const local = await this.usuarios.findByPk(solicitanteId, { attributes: ['rfc', 'nombre'] });
    if (local?.rfc && local.nombre === solicitanteNombre) return local.rfc;
    const externo = await this.sUsuarios.findByPk(solicitanteId);
    return externo?.N_Usuario ?? null;
  }

  /**
   * Dependencia/direccion/departamento del solicitante, solo para el
   * dictamen de baja (§ EQUIPO DE COMPUTO): se resuelven al momento desde
   * saf, no se guardan en ticketsv2. Mismo criterio (y el mismo desempate
   * por nombre) que rfcDelSolicitante: ver ahi el porque.
   */
  /** Publico: tambien lo usa MonitorService para la cola de "en turno". */
  async datosOrganizacionalesDelSolicitante(
    solicitanteId: number,
    solicitanteNombre?: string | null,
  ): Promise<{
    dependencia: string | null;
    direccion: string | null;
    departamento: string | null;
    /** Domicilio fisico del edificio del departamento (saf.t_ubicacion), solo para la cedula de retiro. */
    edificio: string | null;
    /** Nombre largo de la direccion: es lo que usa eservice.impresoras.area (ver nivelTonerDelTicket). */
    direccionCompleta: string | null;
  }> {
    const vacio = {
      dependencia: null,
      direccion: null,
      departamento: null,
      edificio: null,
      direccionCompleta: null,
    };

    const local = await this.usuarios.findByPk(solicitanteId, { attributes: ['rfc', 'nombre'] });
    const sUsuario =
      local?.rfc && local.nombre === solicitanteNombre
        ? await this.sUsuarios.findOne({ where: { N_Usuario: local.rfc } })
        : await this.sUsuarios.findByPk(solicitanteId);
    if (!sUsuario) return vacio;

    const [dep, dir, depto, ubicacionDepto] = await Promise.all([
      sUsuario.id_Dependencia ? this.sDependencias.findByPk(sUsuario.id_Dependencia) : null,
      sUsuario.id_Direccion ? this.sDirecciones.findByPk(sUsuario.id_Direccion) : null,
      sUsuario.id_Departamento ? this.sDepartamentos.findByPk(sUsuario.id_Departamento) : null,
      sUsuario.id_Departamento
        ? this.sUbicacionesDepartamento.findOne({
            where: { departamento_id: sUsuario.id_Departamento },
          })
        : null,
    ]);
    const ubicacion = ubicacionDepto
      ? await this.sUbicaciones.findByPk(ubicacionDepto.ubicacion_id)
      : null;
    return {
      dependencia: dep?.Nombre?.trim() ?? null,
      direccion: dir?.Nombre?.trim() ?? null,
      departamento: (depto?.nombre_completo ?? depto?.Nombre)?.trim() ?? null,
      edificio: ubicacion?.valor?.trim() ?? null,
      direccionCompleta: dir?.nombre_completo?.trim() ?? null,
    };
  }

  /**
   * Equipo de computo asignado al solicitante del ticket, para que el tecnico
   * sepa exactamente cual reparar. Solo aplica a servicio CMP; para el resto
   * el numero de inventario ya se ve como texto plano en el detalle.
   */
  async bienDelTicket(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    if (t.servicio?.clave !== 'CMP') {
      return { bien: null, motivo: 'Este ticket no es de Equipo de cómputo.' };
    }
    /* Hay problemas de CMP (CMP-06, CMP-09, CMP-12…) cuyo campo adicional no
       es un numero de inventario (programa, ubicacion, usuario/carpeta). */
    if (!t.problema?.campo_adicional?.toLowerCase().includes('inventario')) {
      return { bien: null, motivo: 'Este problema no pide un número de inventario.' };
    }
    if (!t.contexto) {
      return { bien: null, motivo: 'El ticket no tiene un número de inventario capturado.' };
    }

    const rfc = await this.rfcDelSolicitante(t.solicitante_id, t.solicitante_nombre);
    if (!rfc) {
      return { bien: null, motivo: 'No se pudo identificar el RFC del solicitante.' };
    }

    const { bienes, motivo } = await this.bienesSrv.porRfcCmp(rfc);
    const encontrado = bienes.find((b) => b.inventario === t.contexto) ?? null;
    return {
      bien: encontrado,
      motivo: encontrado ? null : (motivo ?? 'Ese número de inventario ya no aparece en el sistema.'),
    };
  }

  /**
   * Nivel de tóner de las impresoras arrendadas de la direccion del
   * solicitante (solo servicio IMPA). Cruza saf.t_direccion.nombre_completo
   * contra eservice.impresoras.area — ver ImpresorasService.nivelToner.
   */
  async nivelTonerDelTicket(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    if (t.servicio?.clave !== 'IMPA') {
      return { impresoras: [], motivo: 'Este ticket no es de Impresoras arrendadas.' };
    }
    const org = await this.datosOrganizacionalesDelSolicitante(t.solicitante_id, t.solicitante_nombre);
    return this.impresorasSrv.nivelToner(org.direccionCompleta, usuario);
  }

  /**
   * Lista de bienes para elegir al corregir el numero de inventario de un
   * ticket ya registrado — mismo mecanismo que al darlo de alta (CMP: un
   * solo equipo; el resto de servicios con inventario: varios), pero sobre
   * el resguardo del SOLICITANTE del ticket, no de quien esta corrigiendo.
   * Mismas reglas que actualizarDatos: solo el solicitante o el admin, y
   * solo con el ticket en espera.
   */
  async bienesParaCorregir(id: number, usuario: UsuarioToken) {
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcanceTicket(usuario)) },
      include: INCLUDES,
    });
    if (!ticket) throw new NotFoundException('El ticket no existe o no esta a tu alcance');

    const suyo = ticket.solicitante_id === usuario.id;
    if (!suyo && usuario.rol !== 'admin') {
      throw new ForbiddenException('Solo quien levanto el reporte o el administrador lo corrigen');
    }
    if (ticket.estatus !== ESTATUS.EN_ESPERA) {
      throw new BadRequestException('El ticket debe estar en espera para corregir el número de inventario');
    }

    const campo = (ticket.problema?.campo_adicional ?? '').toLowerCase();
    if (!campo.includes('inventario')) {
      return { bienes: [], motivo: 'Este ticket no captura número de inventario.' };
    }

    const rfc = await this.rfcDelSolicitante(ticket.solicitante_id, ticket.solicitante_nombre);
    if (!rfc) {
      return { bienes: [], motivo: 'No se pudo identificar el RFC del solicitante.' };
    }

    return ticket.servicio?.clave === 'CMP'
      ? this.bienesSrv.porRfcCmp(rfc)
      : this.bienesSrv.porRfc(rfc);
  }

  /**
   * Bienes resguardados del solicitante, para que el tecnico elija de una
   * lista el inventario del equipo que va a retirar (ver ponerEnEspera):
   * a diferencia de bienesParaCorregir(), la pide el tecnico (no el
   * solicitante) ANTES de poner el ticket en espera, y justo porque el
   * problema no trae campo de inventario no hay ese gate aqui.
   */
  async bienesParaRetiro(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    if (t.servicio?.clave !== 'CMP') {
      throw new BadRequestException('Este ticket no es de equipo de computo');
    }

    const rfc = await this.rfcDelSolicitante(t.solicitante_id, t.solicitante_nombre);
    if (!rfc) return { bienes: [], motivo: 'No se pudo identificar el RFC del solicitante.' };

    return this.bienesSrv.porRfcCmp(rfc);
  }

  private esTecnicoDe(t: Ticket, usuario: UsuarioToken): boolean {
    return t.tecnico_id === usuario.id;
  }

  /**
   * true solo si el problema realmente pide un numero de inventario — hay
   * CMP cuyo campo adicional es otra cosa (CMP-06 "Nombre del programa",
   * CMP-09 "Ubicacion destino", CMP-12 "Usuario o carpeta"). Toda la
   * mecanica de SIASAF (mantenimiento, cedulas de salida/entrada, traspaso
   * de custodia) solo tiene sentido cuando esto es true: si no, t.contexto
   * no es un numero de inventario y buscarlo en SIASAF solo produce avisos
   * confusos o, peor, una cedula con datos inventados.
   */
  /**
   * Equipo de computo con un bien identificado: o el problema elegido pedia
   * inventario desde el registro, o ya se capturo despues (ver
   * ponerEnEspera, cuando el tecnico lo agrega al retirar un equipo
   * registrado con un problema tipo "Otro" que no lo pedia).
   */
  private esTicketDeInventarioCmp(t: Ticket): boolean {
    return (
      t.servicio?.clave === 'CMP' &&
      (!!t.problema?.campo_adicional?.toLowerCase().includes('inventario') || !!t.contexto)
    );
  }

  private exigeTecnico(t: Ticket, usuario: UsuarioToken) {
    if (usuario.rol === 'admin') return;
    if (!ROLES_TECNICOS.includes(usuario.rol) || !this.esTecnicoDe(t, usuario)) {
      throw new ForbiddenException('Solo el tecnico asignado puede mover este ticket');
    }
  }

  private exigeSolicitante(t: Ticket, usuario: UsuarioToken) {
    /* Caso especial, solo para el servicio indicado: reemplaza al
       solicitante real, no se suma — ver USUARIOS_CIERRE_SERVICIO. */
    const encargado = USUARIOS_CIERRE_SERVICIO[t.servicio?.clave ?? ''];
    if (encargado) {
      if (usuario.id !== encargado) {
        throw new ForbiddenException('Solo la persona encargada de este servicio puede realizar esta accion');
      }
      return;
    }
    /* El gestor que registro el ticket "a nombre de otro" puede actuar en
       su lugar: cancelarlo, confirmar o rechazar la resolucion. Se suma al
       solicitante real, no lo reemplaza (a diferencia del caso de arriba) —
       cualquiera de los dos puede hacerlo. No aplica a reabrir() — ver
       exigeReabrir(). */
    if (usuario.rol === 'gestor' && t.registrado_por === usuario.id) return;
    if (t.solicitante_id !== usuario.id) {
      throw new ForbiddenException('Solo el solicitante puede realizar esta accion');
    }
  }

  /**
   * Reabrir un ticket cerrado es mas sensible que cancelar/validar/rechazar
   * (reactiva el SLA, puede volver a tocar el folio de cierre): no lo puede
   * hacer ni el solicitante ni el gestor que lo registro, solo el admin y la
   * unica excepcion puntual de USUARIOS_REABREN_TICKETS (por rfc).
   */
  private async exigeReabrir(usuario: UsuarioToken) {
    if (usuario.rol === 'admin') return;
    const local = await this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] });
    if (!local?.rfc || !USUARIOS_REABREN_TICKETS.includes(local.rfc)) {
      throw new ForbiddenException('Solo el administrador puede reabrir un ticket');
    }
  }

  private exigeEstatus(t: Ticket, permitidos: EstatusClave[]) {
    if (!permitidos.includes(t.estatus)) {
      throw new BadRequestException(`No se puede hacer eso con un ticket en estatus ${t.estatus}`);
    }
  }

  async iniciar(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.ASIGNADO]);

    await t.update({ estatus: ESTATUS.EN_ATENCION, f_inicio: t.f_inicio ?? new Date() });
    await this.reglas.anota(t.id, usuario.id, 'Inicio de atencion');
    this.traza.registra('§5', `${t.folio} pasa a EN ATENCION. Se detiene el reloj de primera respuesta.`);

    await this.marcarCmpEnMantenimiento(t, usuario);

    return this.detalle(id, usuario);
  }

  /**
   * Equipo de computo: desde que el tecnico empieza a atender (sea por
   * iniciar() o porque RelojService arranca el reloj y pasa el ticket a EN
   * ATENCION de una vez), el equipo queda "en mantenimiento" en el sistema
   * de bienes — asi nadie mas lo puede elegir al registrar un nuevo ticket
   * mientras se esta revisando. Se libera al cerrar el ticket
   * (atenderCmp/finalizarMantenimiento). Best-effort: si falla, el ticket
   * igual avanza. `t.servicio` debe venir cargado (ver cargar()).
   */
  async marcarCmpEnMantenimiento(t: Ticket, usuario: UsuarioToken): Promise<void> {
    if (!t.contexto || !this.esTicketDeInventarioCmp(t)) return;

    const [tecnicoLocal, rfcSolicitante] = await Promise.all([
      this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] }),
      this.rfcDelSolicitante(t.solicitante_id, t.solicitante_nombre),
    ]);
    if (!tecnicoLocal?.rfc || !rfcSolicitante) return;

    const { bienes } = await this.bienesSrv.porRfcCmp(rfcSolicitante);
    const bien = bienes.find((b) => b.inventario === t.contexto);
    if (!bien?.id) return;

    const inicio = await this.bienesSrv.iniciarMantenimiento(bien.id, tecnicoLocal.rfc, bien.esBc);
    if (!inicio.ok) {
      this.traza.registra('§5', `${t.folio}: no se pudo marcar el equipo en mantenimiento (${inicio.motivo}).`);
    }
  }

  async ponerEnEspera(id: number, motivo: string, usuario: UsuarioToken, inventario?: string) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ATENCION, ESTATUS.ASIGNADO]);

    /*
     * Retirar equipo sin inventario capturado al registrar (p. ej. el
     * problema elegido fue "Otro", que no lo pide): sin numero de
     * inventario no hay bien que documentar en la cedula de custodia, asi
     * que se le exige al tecnico en este momento en vez de dejarlo pasar
     * sin cedula.
     */
    const retiraEquipo = motivo === MOTIVO_RETIRO_EQUIPO && t.servicio?.clave === 'CMP';
    if (retiraEquipo && !t.contexto && !inventario?.trim()) {
      throw new BadRequestException(
        'Este equipo no tiene número de inventario capturado: indícalo para retirarlo',
      );
    }

    const nuevoInventario = retiraEquipo && !t.contexto ? inventario?.trim() || undefined : undefined;

    await t.update({
      estatus: ESTATUS.EN_ESPERA,
      f_espera_desde: new Date(),
      motivo_espera: motivo,
      ...(nuevoInventario && { contexto: nuevoInventario }),
    });
    await this.reglas.anota(t.id, usuario.id, 'En espera', motivo);
    this.traza.registra('§5', `${t.folio} EN ESPERA (${motivo}). Reloj de resolucion pausado.`);

    if (motivo === MOTIVO_RETIRO_EQUIPO && this.esTicketDeInventarioCmp(t)) {
      await this.generarCedulaSalida(t, usuario);
      /*
       * El inventario se acaba de saber en este momento (antes el problema
       * no lo pedia): marcarCmpEnMantenimiento() normalmente corre al
       * iniciar la atencion, pero en ese momento t.contexto todavia estaba
       * vacio, asi que el equipo nunca quedo resguardado en SIASAF. Se
       * marca hasta ahora, que ya se sabe cual es.
       */
      if (nuevoInventario) await this.marcarCmpEnMantenimiento(t, usuario);
    }

    return this.detalle(id, usuario);
  }

  /**
   * Cedula de salida: documenta que el tecnico se lleva el equipo del
   * edificio del solicitante para revisarlo (el solicitante entrega, el
   * tecnico recibe). Best-effort: si algo falla (SIASAF caido, sin numero de
   * inventario…) el ticket ya quedo en espera igual; solo se avisa en la
   * traza, no se le regresa error al tecnico por esto.
   */
  private async generarCedulaSalida(t: Ticket, usuario: UsuarioToken): Promise<void> {
    try {
      if (!t.contexto) return;
      const rfc = await this.rfcDelSolicitante(t.solicitante_id, t.solicitante_nombre);
      if (!rfc) return;

      const [{ bienes }, org] = await Promise.all([
        this.bienesSrv.porRfcCmp(rfc),
        this.datosOrganizacionalesDelSolicitante(t.solicitante_id, t.solicitante_nombre),
      ]);
      const bien = bienes.find((b) => b.inventario === t.contexto);
      const detalleBien = bien?.id ? await this.bienesSrv.detalleBien(bien.id, bien.esBc) : null;
      const resguardatario = t.solicitante_nombre ?? t.solicitante?.nombre ?? '—';

      const pdf = await this.cedulaCustodiaSrv.generar({
        folio: t.folio,
        resguardatarioNombre: resguardatario,
        areaAdscripcion: org.departamento,
        edificio: org.edificio,
        telefonoExtension: t.extension,
        bien: detalleBien ?? {
          numero_inventario: t.contexto,
          nombre_bien: '—',
          marca: null,
          modelo: null,
          numero_serie: null,
          color: null,
          material: null,
        },
        entregaNombre: resguardatario,
        recibeNombre: usuario.nombre,
      });

      if (!existsSync(CARPETA_CEDULAS)) mkdirSync(CARPETA_CEDULAS, { recursive: true });
      const archivo = `ticket-${t.id}-salida-${Date.now()}.pdf`;
      writeFileSync(join(CARPETA_CEDULAS, archivo), pdf);
      await t.update({ cedula_salida_url: archivo });
      this.traza.registra('§5', `${t.folio}: cédula de salida generada (${archivo}).`);
    } catch (e) {
      this.traza.registra(
        '§5',
        `${t.folio}: no se pudo generar la cédula de salida (${(e as Error).message}).`,
      );
    }
  }

  async reanudar(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ESPERA]);

    /*
     * Dos tiempos distintos: pausaSeg es el real (reloj de pared), solo para
     * que la bitacora diga cuanto duro la pausa de verdad. Lo que se
     * acumula en espera_acum_seg (lo que de verdad se descuenta del tiempo
     * activo) es en minutos de jornada laboral — igual criterio que
     * minutosActivos(), si el reloj SLA no corria fuera de horario, pausarlo
     * fuera de horario tampoco le "ahorra" nada al tecnico.
     */
    const pausaSeg = t.f_espera_desde
      ? Math.round((Date.now() - new Date(t.f_espera_desde).getTime()) / 1000)
      : 0;
    const pausaMinHabil = t.f_espera_desde ? minutosHabiles(new Date(t.f_espera_desde), new Date()) : 0;

    const veniaDeRetiroEquipo =
      t.motivo_espera === MOTIVO_RETIRO_EQUIPO && this.esTicketDeInventarioCmp(t);

    await t.update({
      espera_acum_seg: t.espera_acum_seg + pausaMinHabil * 60,
      f_espera_desde: null,
      estatus: ESTATUS.EN_ATENCION,
    });
    await this.reglas.anota(
      t.id,
      usuario.id,
      'Reanudacion',
      `Estuvo ${Math.round(pausaSeg / 60)} min en espera (${pausaMinHabil} min de jornada laboral)`,
    );
    this.traza.registra(
      '§5',
      `${t.folio} reanudado. Se descontaron ${pausaMinHabil} min (jornada laboral) del tiempo de resolucion.`,
    );

    /* Regresa con el equipo: se documenta la entrada (ver generarCedulaEntrada). */
    if (veniaDeRetiroEquipo && t.cedula_salida_url) {
      await this.generarCedulaEntrada(t, usuario);
    }

    return this.detalle(id, usuario);
  }

  /**
   * Cedula de entrada: documenta que el tecnico regresa el equipo al
   * solicitante (el tecnico entrega, el solicitante recibe) — se dispara al
   * reanudar un ticket que se habia pausado para retirar el equipo. Mismos
   * datos que la cedula de salida, ENTREGA/RECIBE invertidos. Best-effort:
   * si falla, el ticket igual se reanuda.
   */
  private async generarCedulaEntrada(t: Ticket, usuario: UsuarioToken): Promise<void> {
    try {
      if (!t.contexto) return;
      const rfc = await this.rfcDelSolicitante(t.solicitante_id, t.solicitante_nombre);
      if (!rfc) return;

      const [{ bienes }, org] = await Promise.all([
        this.bienesSrv.porRfcCmp(rfc),
        this.datosOrganizacionalesDelSolicitante(t.solicitante_id, t.solicitante_nombre),
      ]);
      const bien = bienes.find((b) => b.inventario === t.contexto);
      const detalleBien = bien?.id ? await this.bienesSrv.detalleBien(bien.id, bien.esBc) : null;
      const resguardatario = t.solicitante_nombre ?? t.solicitante?.nombre ?? '—';

      const pdf = await this.cedulaCustodiaSrv.generar({
        folio: t.folio,
        resguardatarioNombre: resguardatario,
        areaAdscripcion: org.departamento,
        edificio: org.edificio,
        telefonoExtension: t.extension,
        bien: detalleBien ?? {
          numero_inventario: t.contexto,
          nombre_bien: '—',
          marca: null,
          modelo: null,
          numero_serie: null,
          color: null,
          material: null,
        },
        entregaNombre: usuario.nombre,
        recibeNombre: resguardatario,
      });

      if (!existsSync(CARPETA_CEDULAS)) mkdirSync(CARPETA_CEDULAS, { recursive: true });
      const archivo = `ticket-${t.id}-entrada-${Date.now()}.pdf`;
      writeFileSync(join(CARPETA_CEDULAS, archivo), pdf);
      await t.update({ cedula_entrada_url: archivo });
      this.traza.registra('§5', `${t.folio}: cédula de entrada generada (${archivo}).`);
    } catch (e) {
      this.traza.registra(
        '§5',
        `${t.folio}: no se pudo generar la cédula de entrada (${(e as Error).message}).`,
      );
    }
  }

  async resolver(id: number, dto: ResolverDto, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ATENCION, ESTATUS.EN_ESPERA, ESTATUS.ASIGNADO]);

    /*
     * CNA (Cartas de no adeudo): no se captura diagnostico/solucion/
     * refacciones, en su lugar el tecnico marca una sola revision para
     * todo el ticket — completa, o incompleta con observaciones. No
     * bloquea el cierre: es solo el registro de como quedo.
     */
    const esRevisionBienes = t.servicio?.clave === 'CNA';
    /*
     * SISTEMAS (PROGRESS): lo atiende el rol "sistemas" (una sola persona,
     * interna del area), asi que no tiene caso pedirle al solicitante que
     * confirme — el ticket cierra solo al resolverse, sin pasar por
     * RESUELTO ni por el cierre por omision de 3 dias.
     */
    const cierreInmediato = t.servicio?.clave === 'SIS';
    if (esRevisionBienes) {
      if (!dto.revision) throw new BadRequestException('Indica si la revisión quedó completa o incompleta');
      if (dto.revision === 'incompleta' && !dto.observaciones?.trim()) {
        throw new BadRequestException('Captura las observaciones de la revisión incompleta');
      }
    } else {
      if (!dto.diagnostico?.trim()) throw new BadRequestException('El diagnostico es obligatorio');
      if (!dto.solucion?.trim()) throw new BadRequestException('La solucion es obligatoria');
    }
    /* IMPA (impresoras arrendadas): ademas de diagnostico/solucion, deja registrado que tecnico del proveedor atendio. */
    const esImpa = t.servicio?.clave === 'IMPA';
    if (esImpa && !dto.tecnico_externo_id) {
      throw new BadRequestException('Indica que tecnico atendio el ticket');
    }

    /* El reloj tiene que estar corriendo: sin eso no hay tiempo en sitio que registrar. */
    const sesionAbierta = await this.sesiones.findOne({ where: { ticket_id: t.id, fin: null } });
    if (!sesionAbierta) {
      throw new BadRequestException('Inicia el reloj antes de marcar el ticket como resuelto');
    }

    /* Al resolver se cierra la sesion de reloj que seguia corriendo. */
    await this.sesiones.update(
      { fin: new Date(), motivo: 'Servicio concluido' },
      { where: { ticket_id: t.id, fin: null } },
    );

    const ahora = new Date();
    await this.db.transaction(async (tx) => {
      await t.update(
        {
          estatus: cierreInmediato ? ESTATUS.CERRADO : ESTATUS.RESUELTO,
          f_resolucion: ahora,
          f_validacion: cierreInmediato ? ahora : null,
          cierre_por_omision: false,
          f_espera_desde: null,
          diagnostico: esRevisionBienes ? null : dto.diagnostico,
          solucion: esRevisionBienes ? null : dto.solucion,
          refacciones: esRevisionBienes ? null : dto.refacciones?.trim() || 'Ninguna',
          revision_bienes: esRevisionBienes ? dto.revision! : null,
          observaciones_revision: esRevisionBienes ? dto.observaciones?.trim() || null : null,
          tecnico_externo_id: esImpa ? dto.tecnico_externo_id! : null,
        },
        { transaction: tx },
      );
      if (cierreInmediato) await this.reglas.asignaFolioDeCierre(t, tx);
    });
    await this.reglas.anota(
      t.id,
      usuario.id,
      'Resuelto',
      esRevisionBienes
        ? `Revisión ${dto.revision}${dto.observaciones ? `: ${dto.observaciones.trim()}` : ''}`
        : `${dto.diagnostico} → ${dto.solucion}`,
    );
    if (cierreInmediato) {
      await this.reglas.anota(
        t.id,
        usuario.id,
        'Cerrado automáticamente',
        'SISTEMAS (PROGRESS) no requiere confirmación del solicitante.',
      );
    }

    const objetivos = await this.reglas.objetivos();
    const objetivo = objetivos.get(t.prioridad) ?? 1440;
    const activo = ReglasService.minutosActivos(t);
    this.traza.registra(
      '§10',
      `${t.folio} resuelto en ${activo} min (objetivo ${objetivo} min) · ` +
        `${activo <= objetivo ? 'dentro de tiempo' : 'FUERA DE TIEMPO'}` +
        (cierreInmediato ? '. Cerrado automaticamente (SISTEMAS).' : '. Notificado al solicitante.'),
    );
    return this.detalle(id, usuario);
  }

  /* ------------------------------------------------------------------
     Atencion de EQUIPO DE COMPUTO (CMP): reemplaza a resolver() para este
     servicio. El tecnico declara si reparo el equipo (mismos campos de
     siempre) o si lo dio de baja; en ese caso el sistema mismo genera el
     dictamen tecnico en pdf a partir de las observaciones y fotos que
     capture. Al cerrar, se avisa a SIASAF que el bien queda asignado
     temporalmente al tecnico.
     ------------------------------------------------------------------ */

  async atenderCmp(
    id: number,
    dto: AtenderCmpDto,
    fotos: { buffer: Buffer; mimetype: string }[],
    usuario: UsuarioToken,
  ) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ATENCION, ESTATUS.EN_ESPERA, ESTATUS.ASIGNADO]);

    if (t.servicio?.clave !== 'CMP') {
      throw new BadRequestException('Esta accion solo aplica a tickets de Equipo de cómputo');
    }
    if (dto.resultado === 'baja' && !dto.observaciones?.trim()) {
      throw new BadRequestException('Captura las observaciones para generar el dictamen de baja');
    }

    /* El reloj tiene que estar corriendo: sin eso no hay tiempo en sitio que registrar. */
    const sesionAbierta = await this.sesiones.findOne({ where: { ticket_id: t.id, fin: null } });
    if (!sesionAbierta) {
      throw new BadRequestException('Inicia el reloj antes de atender el ticket');
    }

    const reparado = dto.resultado === 'reparado';

    /*
     * Cierre del mantenimiento: el "entra a mantenimiento" ya paso en
     * iniciar(), cuando el tecnico empezo a atender. El equipo siempre
     * regresa a quien levanto el ticket, sea cual sea el resultado — el
     * traspaso a almacen y el cierre formal de la baja los genera despues,
     * aparte, el area de bienes con el dictamen como respaldo. Best-effort —
     * si algo falla, el ticket igual se finaliza en SITickets; el aviso se
     * regresa en la respuesta para que el tecnico sepa que debe avisar al
     * área.
     */
    let avisoCustodia: string | null = null;
    let bienId: number | null = null;
    let bienEsBc = false;
    if (t.contexto && this.esTicketDeInventarioCmp(t)) {
      const [tecnicoLocal, rfcSolicitante] = await Promise.all([
        this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] }),
        this.rfcDelSolicitante(t.solicitante_id, t.solicitante_nombre),
      ]);
      if (rfcSolicitante) {
        const { bienes } = await this.bienesSrv.porRfcCmp(rfcSolicitante);
        const bien = bienes.find((b) => b.inventario === t.contexto);
        bienId = bien?.id ?? null;
        bienEsBc = bien?.esBc ?? false;
        if (bien?.id && tecnicoLocal?.rfc) {
          const cierre = await this.bienesSrv.finalizarMantenimiento(bien.id, tecnicoLocal.rfc, bien.esBc, {
            reparado,
            observaciones: !reparado ? dto.observaciones!.trim() : undefined,
          });
          if (!cierre.ok) avisoCustodia = cierre.motivo;
        } else {
          avisoCustodia = 'No se encontró el equipo en SIASAF para avisar la asignación temporal.';
        }
      }
    }

    /* Dado de baja: el sistema genera el dictamen tecnico en pdf. */
    let dictamenArchivo: string | null = null;
    if (!reparado) {
      const [detalleBien, org] = await Promise.all([
        bienId ? this.bienesSrv.detalleBien(bienId, bienEsBc) : null,
        this.datosOrganizacionalesDelSolicitante(t.solicitante_id, t.solicitante_nombre),
      ]);

      const pdf = await this.dictamenSrv.generar({
        folio: t.folio,
        solicitanteNombre: t.solicitante_nombre ?? t.solicitante?.nombre ?? '—',
        dependencia: org.dependencia,
        direccion: org.direccion,
        departamento: org.departamento,
        servicioNombre: t.servicio?.nombre ?? '—',
        bien: detalleBien ?? {
          numero_inventario: t.contexto ?? '—',
          nombre_bien: '—',
          material: null,
          marca: null,
          modelo: null,
        },
        observaciones: dto.observaciones!.trim(),
        tecnicoNombre: usuario.nombre,
        fotos,
      });

      if (!existsSync(CARPETA_DICTAMENES)) mkdirSync(CARPETA_DICTAMENES, { recursive: true });
      dictamenArchivo = `ticket-${id}-${Date.now()}.pdf`;
      writeFileSync(join(CARPETA_DICTAMENES, dictamenArchivo), pdf);
    }

    /* Al resolver se cierra la sesion de reloj que seguia corriendo. */
    await this.sesiones.update(
      { fin: new Date(), motivo: 'Servicio concluido' },
      { where: { ticket_id: t.id, fin: null } },
    );

    await t.update({
      estatus: ESTATUS.RESUELTO,
      f_resolucion: new Date(),
      f_espera_desde: null,
      resultado_cmp: dto.resultado,
      /* En baja, diagnostico guarda el mismo texto que el "II. DICTAMEN" del pdf: antes solo vivia en el archivo. */
      diagnostico: reparado ? dto.diagnostico : dto.observaciones!.trim(),
      solucion: reparado ? dto.solucion : null,
      refacciones: reparado ? dto.refacciones?.trim() || 'Ninguna' : null,
      dictamen_url: reparado ? null : dictamenArchivo,
    });

    await this.reglas.anota(
      t.id,
      usuario.id,
      'Resuelto',
      reparado
        ? `${dto.diagnostico} → ${dto.solucion}`
        : 'Equipo dado de baja · dictamen generado',
    );

    const objetivos = await this.reglas.objetivos();
    const objetivo = objetivos.get(t.prioridad) ?? 1440;
    const activo = ReglasService.minutosActivos(t);
    this.traza.registra(
      '§10',
      `${t.folio} ${reparado ? 'reparado' : 'dado de baja'} en ${activo} min (objetivo ${objetivo} min) · ` +
        `${activo <= objetivo ? 'dentro de tiempo' : 'FUERA DE TIEMPO'}.`,
    );

    const detalle = await this.detalle(id, usuario);
    return { ...detalle, aviso_custodia: avisoCustodia };
  }

  /** Descarga el dictamen de baja de un ticket CMP, si tiene. */
  async dictamenDelTicket(id: number, usuario: UsuarioToken): Promise<StreamableFile> {
    const t = await this.cargar(id, usuario);
    if (!t.dictamen_url) throw new NotFoundException('Este ticket no tiene dictamen adjunto');

    const ruta = join(CARPETA_DICTAMENES, t.dictamen_url);
    if (!existsSync(ruta)) throw new NotFoundException('El dictamen ya no está disponible');

    return new StreamableFile(createReadStream(ruta), {
      type: 'application/pdf',
      disposition: `inline; filename="${t.folio.replace(/\//g, '-')}-dictamen.pdf"`,
    });
  }

  /** Descarga la cédula de salida (el técnico se llevó el equipo) de un ticket CMP, si tiene. */
  async cedulaSalidaDelTicket(id: number, usuario: UsuarioToken): Promise<StreamableFile> {
    const t = await this.cargar(id, usuario);
    if (!t.cedula_salida_url) {
      throw new NotFoundException('Este ticket no tiene cédula de salida adjunta');
    }

    const ruta = join(CARPETA_CEDULAS, t.cedula_salida_url);
    if (!existsSync(ruta)) throw new NotFoundException('La cédula ya no está disponible');

    return new StreamableFile(createReadStream(ruta), {
      type: 'application/pdf',
      disposition: `inline; filename="${t.folio.replace(/\//g, '-')}-cedula-salida.pdf"`,
    });
  }

  /** Descarga la cédula de entrada (el equipo regresó al solicitante) de un ticket CMP, si tiene. */
  async cedulaEntradaDelTicket(id: number, usuario: UsuarioToken): Promise<StreamableFile> {
    const t = await this.cargar(id, usuario);
    if (!t.cedula_entrada_url) {
      throw new NotFoundException('Este ticket no tiene cédula de entrada adjunta');
    }

    const ruta = join(CARPETA_CEDULAS, t.cedula_entrada_url);
    if (!existsSync(ruta)) throw new NotFoundException('La cédula ya no está disponible');

    return new StreamableFile(createReadStream(ruta), {
      type: 'application/pdf',
      disposition: `inline; filename="${t.folio.replace(/\//g, '-')}-cedula-entrada.pdf"`,
    });
  }

  async validar(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeEstatus(t, [ESTATUS.RESUELTO]);
    if (usuario.rol !== 'admin') this.exigeSolicitante(t, usuario);

    await this.db.transaction(async (tx) => {
      await t.update(
        { estatus: ESTATUS.CERRADO, f_validacion: new Date(), cierre_por_omision: false },
        { transaction: tx },
      );
      await this.reglas.asignaFolioDeCierre(t, tx);
    });
    await this.reglas.anota(
      t.id,
      usuario.id,
      usuario.rol === 'admin' ? 'Cerrado por el administrador' : 'Validado por el usuario',
      undefined,
      undefined,
      undefined,
      usuario.nombre,
    );
    this.traza.registra('§10', `${t.folio} validado. Cierre real, no por omision.`);
    return this.detalle(id, usuario);
  }

  async rechazar(id: number, motivo: string | undefined, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeSolicitante(t, usuario);
    this.exigeEstatus(t, [ESTATUS.RESUELTO]);

    /*
     * El motivo solo es obligatorio fuera de CNA (Cartas de no adeudo): ahi
     * quien cierra en lugar del solicitante (ver USUARIOS_CIERRE_SERVICIO)
     * rechaza con un clic, sin escribir nada — el tecnico ya sabe que falto
     * algo por la revision incompleta que el mismo dejo marcada al resolver.
     */
    const esRevisionBienes = t.servicio?.clave === 'CNA';
    if (!esRevisionBienes && !motivo?.trim()) {
      throw new BadRequestException('El motivo es obligatorio');
    }

    /* Conserva folio y tecnico: es el mismo problema, no uno nuevo (§5). */
    await t.update({
      estatus: ESTATUS.EN_ATENCION,
      rechazos: t.rechazos + 1,
      f_resolucion: null,
    });
    await this.reglas.anota(
      t.id,
      usuario.id,
      'Rechazado por el usuario',
      motivo?.trim() || undefined,
      undefined,
      undefined,
      usuario.nombre,
    );
    this.traza.registra(
      '§5',
      `${t.folio} rechazado por el solicitante${motivo ? ` (${motivo})` : ''}. Regresa a EN ATENCION; conserva el folio.`,
    );
    return this.detalle(id, usuario);
  }

  async reabrir(id: number, motivo: string, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    await this.exigeReabrir(usuario);
    this.exigeEstatus(t, [ESTATUS.CERRADO]);

    await t.update({
      estatus: ESTATUS.EN_ATENCION,
      reaperturas: t.reaperturas + 1,
      f_resolucion: null,
      f_validacion: null,
      cierre_por_omision: false,
    });
    await this.reglas.anota(t.id, usuario.id, 'Reapertura', motivo, undefined, undefined, usuario.nombre);
    this.traza.registra('§5', `${t.folio} reabierto (reapertura #${t.reaperturas + 1}). El folio no cambia.`);
    return this.detalle(id, usuario);
  }

  async cancelar(id: number, motivo: string, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);

    if (usuario.rol !== 'admin') {
      this.exigeSolicitante(t, usuario);
      /* El solicitante solo cancela mientras nadie ha trabajado el ticket. */
      this.exigeEstatus(t, [ESTATUS.REGISTRADO, ESTATUS.ASIGNADO]);
    } else {
      this.exigeEstatus(t, [
        ESTATUS.REGISTRADO,
        ESTATUS.ASIGNADO,
        ESTATUS.EN_ATENCION,
        ESTATUS.EN_ESPERA,
        ESTATUS.RESUELTO,
      ]);
    }

    await this.sesiones.update(
      { fin: new Date(), motivo: 'Ticket cancelado' },
      { where: { ticket_id: t.id, fin: null } },
    );
    await t.update({
      estatus: ESTATUS.CANCELADO,
      f_cancelacion: new Date(),
      motivo_cancelacion: motivo,
    });
    await this.reglas.anota(t.id, usuario.id, 'Cancelado', motivo, undefined, undefined, usuario.nombre);
    this.traza.registra('§5', `${t.folio} cancelado (${motivo}).`);
    return this.detalle(id, usuario);
  }

  /* ------------------------------------------------------------------
     §9 · reasignacion manual. Siempre con motivo y siempre en bitacora.
     ------------------------------------------------------------------ */

  async reasignar(id: number, dto: ReasignarDto, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    if (ESTATUS_FINALES.includes(t.estatus)) {
      throw new BadRequestException('Un ticket cerrado o cancelado ya no se reasigna');
    }
    if (t.tecnico_id === dto.tecnico) {
      throw new BadRequestException('Elige un tecnico distinto al actual');
    }

    const destino = await this.usuarios.findOne({
      where: { id: dto.tecnico, activo: true, rol: { [Op.in]: ROLES_TECNICOS } },
    });
    if (!destino) throw new BadRequestException('El tecnico destino no existe o no esta activo');

    const antes = t.tecnico_id
      ? ((await this.usuarios.findByPk(t.tecnico_id))?.nombre ?? 'Sin asignar')
      : 'Sin asignar';

    /* Si el tecnico anterior dejo el reloj corriendo, se cierra aqui: el
       nuevo tecnico arranca desde 0 y no queda bloqueado por una sesion
       ajena que ya no aplica. */
    await this.sesiones.update(
      { fin: new Date(), motivo: 'Ticket reasignado' },
      { where: { ticket_id: t.id, fin: null } },
    );

    await t.update({
      tecnico_id: destino.id,
      en_cola: false,
      reasignaciones: t.reasignaciones + 1,
      estatus: t.estatus === ESTATUS.REGISTRADO ? ESTATUS.ASIGNADO : t.estatus,
      f_asignacion: t.f_asignacion ?? new Date(),
    });

    await this.reglas.anota(t.id, usuario.id, 'Reasignacion manual', dto.nota ?? null, undefined, {
      motivo: dto.motivo,
      antes,
      nuevo: destino.nombre,
    });
    this.traza.registra(
      '§9',
      `${t.folio} reasignado ${antes} → ${destino.nombre}. Motivo: ${dto.motivo}. Queda en bitacora.`,
    );

    if (t.reasignaciones + 1 >= 2) {
      this.traza.registra(
        '§9',
        `${t.folio} marcado con bandera: ${t.reasignaciones + 1} reasignaciones. ` +
          'Revisar si el catalogo indujo un tipo de servicio equivocado.',
      );
    }
    return this.detalle(id, usuario);
  }

  /* ------------------------------------------------------------------
     §6 · reclasificacion. Cambia el servicio; el folio nunca.
     ------------------------------------------------------------------ */

  /** Solo el administrador reclasifica: @Roles('admin') en el controller ya lo garantiza. */
  async reclasificar(id: number, dto: ReclasificarDto, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    if (ESTATUS_FINALES.includes(t.estatus)) {
      throw new BadRequestException('Un ticket cerrado o cancelado ya no se reclasifica');
    }

    const problema = await this.problemas.findOne({
      where: { clave: dto.problema, activo: true },
      include: [Servicio],
    });
    if (!problema) throw new BadRequestException('El problema no existe en el catalogo');
    if (problema.servicio_id === t.servicio_id) {
      throw new BadRequestException('Elige un tipo de servicio distinto al actual');
    }

    const antes = t.servicio?.nombre ?? '—';
    const tecnicoAntes = t.tecnico_id;

    await this.db.transaction(async (tx) => {
      await t.update(
        {
          servicio_id: problema.servicio_id,
          problema_id: problema.id,
          prioridad: problema.prioridad,
          reclasificado: true,
        },
        { transaction: tx },
      );

      await this.reglas.anota(t.id, usuario.id, 'Reclasificacion', dto.motivo, tx, {
        motivo: 'Reclasificacion de servicio',
        antes,
        nuevo: problema.servicio.nombre,
      });

      const nuevo = await this.reglas.asignar(t, tx, 'Disparado por reclasificacion.');
      if (nuevo && nuevo !== tecnicoAntes) {
        await t.update({ reasignaciones: t.reasignaciones + 1 }, { transaction: tx });
      }
    });

    this.traza.registra(
      '§6',
      `${t.folio} reclasificado ${antes} → ${problema.servicio.nombre}. ` +
        `El folio se conserva (${t.folio}); no se renumera ni se cancela.`,
    );
    this.traza.registra(
      '§6',
      'Aviso: el prefijo del folio ya no corresponde al servicio. ' +
        'Los reportes deben leer el campo servicio, nunca el prefijo.',
    );
    return this.detalle(id, usuario);
  }

  /* ------------------------------------------------------------------
     §4 · cambio manual de prioridad
     ------------------------------------------------------------------ */

  async cambiarPrioridad(id: number, dto: PrioridadDto, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    if (ESTATUS_FINALES.includes(t.estatus)) {
      throw new BadRequestException('Un ticket cerrado o cancelado ya no cambia de prioridad');
    }
    if (t.prioridad === dto.prioridad) {
      throw new BadRequestException('El ticket ya tiene esa prioridad');
    }

    const antes = t.prioridad;
    await t.update({ prioridad: dto.prioridad });
    await this.reglas.anota(t.id, usuario.id, 'Cambio de prioridad', dto.motivo, undefined, {
      antes,
      nuevo: dto.prioridad,
    });
    this.traza.registra(
      '§4',
      `${t.folio} cambia de prioridad ${antes} → ${dto.prioridad} por decision del administrador (${dto.motivo}).`,
    );
    return this.detalle(id, usuario);
  }
}
