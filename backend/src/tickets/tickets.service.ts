import {
  BadRequestException,
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
import {
  Area,
  CatalogoProblema,
  Dependencia,
  ESTATUS,
  ESTATUS_FINALES,
  EstatusClave,
  SDependencia,
  SDepartamento,
  SDireccion,
  Sede,
  Servicio,
  ServicioUsuarioPermitido,
  SUsuario,
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
import { RFC_SIEMPRE_A_NOMBRE_PROPIO } from '../catalogos/catalogos.service';
import type { UsuarioToken } from '../common/usuario-actual.decorator';
import { dominioInstitucional, esCampoCuentaCorreo, revisaCuentaCorreo } from '../common/correo';
import {
  CrearInternoDto,
  CrearTicketDto,
  DatosGeneralesDto,
  PrioridadDto,
  ReasignarDto,
  ReclasificarDto,
  ResolverDto,
} from './dto/tickets.dto';
import { AtenderCmpDto } from './dto/atender-cmp.dto';

/**
 * Carpeta donde se guardan los dictamenes de baja (pdf). Vive dentro de
 * storage/ porque en produccion (docker-compose.prod.yml) es la unica
 * carpeta que se monta como volumen persistente; uploads/ se hubiera
 * perdido en cada redeploy.
 */
export const CARPETA_DICTAMENES = join(process.cwd(), 'storage', 'dictamenes');

/** Roles que atienden tickets y por tanto ven solo lo que traen turnado. */
const ROLES_TECNICOS = ['tecnico', 'proveedor', 'jefe'];

const INCLUDES = [
  { model: Servicio, as: 'servicio' },
  { model: Servicio, as: 'servicio_original' },
  { model: CatalogoProblema, as: 'problema' },
  { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
  { model: Dependencia },
  { model: Area },
  { model: Sede },
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
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(Area) private readonly areas: typeof Area,
    @InjectModel(Dependencia) private readonly dependencias: typeof Dependencia,
    @InjectModel(ServicioUsuarioPermitido)
    private readonly permitidosServicio: typeof ServicioUsuarioPermitido,
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
    @InjectModel(SDependencia, 'saf') private readonly sDependencias: typeof SDependencia,
    @InjectModel(SDireccion, 'saf') private readonly sDirecciones: typeof SDireccion,
    @InjectModel(SDepartamento, 'saf') private readonly sDepartamentos: typeof SDepartamento,
    private readonly reglas: ReglasService,
    private readonly traza: TrazaService,
    private readonly config: ConfigService,
    private readonly bienesSrv: BienesService,
    private readonly dictamenSrv: DictamenService,
  ) {}

  /* ==================================================================
     Consulta. El alcance lo decide el rol, no la pantalla.
     ================================================================== */

  /**
   * Filtro base por rol. Es la pieza que faltaba en la API original: alli
   * cualquiera podia pedir cualquier ticket porque el identificador venia del
   * navegador. Aqui el alcance sale del token y no se puede ampliar por URL.
   */
  private async alcance(usuario: UsuarioToken): Promise<Record<string, unknown>> {
    /** El operador ve todo, igual que el administrador, pero no administra catalogos. */
    if (usuario.rol === 'admin' || usuario.rol === 'operador') return {};
    if (usuario.rol === 'solicitante') return { solicitante_id: usuario.id };
    /**
     * El gestor ve su propio historico (lo que registro para si mismo) y lo
     * que registro a nombre de otros (ahi solicitante_id es el id de esa
     * otra persona, no el suyo; por eso se busca tambien por registrado_por).
     */
    if (usuario.rol === 'gestor') {
      return {
        [Op.or]: [{ solicitante_id: usuario.id }, { registrado_por: usuario.id }],
      };
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
      return {
        [Op.or]: [
          { tecnico_id: usuario.id },
          { solicitante_id: { [Op.in]: solicitanteIds } },
          {
            id: {
              [Op.in]: Sequelize.literal(
                `(SELECT ticket_id FROM ticket_tecnico WHERE usuario_id = ${Number(usuario.id)})`,
              ),
            },
          },
        ],
      };
    }
    return { id: null };
  }

  async listar(usuario: UsuarioToken, filtros: Record<string, string | undefined> = {}) {
    const where: Record<string, unknown> = { ...(await this.alcance(usuario)) };

    if (filtros.servicio) where.servicio_id = Number(filtros.servicio);
    if (filtros.prioridad) where.prioridad = filtros.prioridad;
    if (filtros.tecnico) where.tecnico_id = Number(filtros.tecnico);
    if (filtros.interno === 'true') where.interno = true;
    if (filtros.interno === 'false') where.interno = false;
    if (filtros.estatus === 'EN_COLA') where.en_cola = true;
    else if (filtros.estatus) where.estatus = filtros.estatus;
    if (filtros.abiertos === 'true') where.estatus = { [Op.notIn]: ESTATUS_FINALES };

    const filas = await this.tickets.findAll({
      where,
      include: INCLUDES,
      order: [['f_registro', 'DESC']],
      limit: 500,
    });

    const objetivos = await this.reglas.objetivos();
    const conteos = await this.conteoSesiones(filas.map((t) => t.id));
    return filas.map((t) => this.resumen(t, objetivos, conteos.get(t.id) ?? 0));
  }

  async detalle(id: number, usuario: UsuarioToken) {
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcance(usuario)) },
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
    const orgSaf = await this.datosOrganizacionalesDelSolicitante(ticket.solicitante_id);

    return {
      ...this.resumen(ticket, objetivos, sesiones.length),
      dependencia_saf: orgSaf.dependencia,
      direccion_saf: orgSaf.direccion,
      departamento_saf: orgSaf.departamento,
      texto_libre: ticket.texto_libre,
      diagnostico: ticket.diagnostico,
      solucion: ticket.solucion,
      refacciones: ticket.refacciones,
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

  private resumen(t: Ticket, objetivos: Map<string, number>, sesiones: number) {
    const objetivo = objetivos.get(t.prioridad) ?? 1440;
    return {
      id: t.id,
      folio: t.folio,
      servicio_id: t.servicio_id,
      servicio: t.servicio?.nombre ?? '—',
      servicio_clave: t.servicio?.clave ?? '',
      servicio_original: t.servicio_original?.nombre ?? '—',
      problema_id: t.problema_id,
      problema: t.problema?.descripcion ?? 'Sin clasificar',
      problema_clave: t.problema?.clave ?? '',
      prioridad: t.prioridad,
      estatus: t.estatus,
      contexto: t.contexto,
      solicitante_id: t.solicitante_id,
      solicitante: t.solicitante_nombre ?? t.solicitante?.nombre ?? '—',
      /** Solo trae valor cuando alguien registro el ticket a nombre de otro. */
      registrado_por: t.registrado_por,
      registrado_por_nombre: t.registrado_por_nombre,
      /** Solo aplica a servicio CMP: como termino la atencion del equipo. */
      resultado_cmp: t.resultado_cmp,
      tiene_dictamen: !!t.dictamen_url,
      dependencia: t.dependencia?.nombre ?? '—',
      area: t.area?.nombre ?? '—',
      /* Los ids los usa el formulario de correccion para preseleccionar. */
      dependencia_id: t.dependencia_id,
      area_id: t.area_id,
      extension: t.extension,
      sede: t.sede?.nombre ?? null,
      tecnico_id: t.tecnico_id,
      tecnico: t.tecnico?.nombre ?? null,
      interno: t.interno,
      f_registro: t.f_registro,
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
      min_espera: Math.round(
        (t.espera_acum_seg * 1000 +
          (t.f_espera_desde ? Date.now() - new Date(t.f_espera_desde).getTime() : 0)) /
          60_000,
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
      const area = quien.area_id ? await this.areas.findByPk(quien.area_id) : null;
      return {
        nombre: quien.nombre,
        dependencia_id: quien.dependencia_id,
        area_id: quien.area_id,
        sede_id: area?.sede_id ?? null,
        extension: quien.extension,
      };
    }

    const datos = await this.datosSaf(usuario.id);
    if (!datos) throw new ForbiddenException('Sesion invalida');
    return { ...datos, area_id: null, sede_id: null, extension: null };
  }

  /** Empareja por nombre exacto contra el catalogo local; null si no hay match. */
  private async resolverDependenciaSaf(idSaf: number | null): Promise<number | null> {
    if (!idSaf) return null;
    const sDep = await this.sDependencias.findByPk(idSaf);
    if (!sDep) return null;
    const local = await this.dependencias.findOne({ where: { nombre: sDep.Nombre.trim() } });
    return local?.id ?? null;
  }

  /**
   * Nombre y dependencia de un usuario activo de saf, dado su id_Usuario.
   * Se usa tanto para la sesion del solicitante externo (§2) como para que
   * el administrador registre un ticket a nombre de otro usuario activo.
   */
  private async datosSaf(
    idUsuarioSaf: number,
  ): Promise<{ nombre: string; dependencia_id: number | null } | null> {
    const sUsuario = await this.sUsuarios.findByPk(idUsuarioSaf);
    if (!sUsuario || sUsuario.Estado !== 1) return null;
    return {
      nombre: sUsuario.Nombre,
      dependencia_id: await this.resolverDependenciaSaf(sUsuario.id_Dependencia),
    };
  }

  /**
   * Dependencia (id de saf) de un usuario local, cruzando su rfc contra
   * saf.s_usuario.N_Usuario. Se usa para saber a que dependencia pertenece
   * un gestor, y limitarlo a registrar solo a nombre de gente de esa misma
   * dependencia. Sin rfc (o sin match en saf) no se le puede identificar
   * dependencia, asi que no se le ofrece nadie: es el default seguro.
   */
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
  async buscarSolicitantes(q: string, usuario: UsuarioToken) {
    const texto = q.trim();
    if (texto.length < 3) return [];

    const where: Record<string, unknown> = { Estado: 1, Nombre: { [Op.like]: `%${texto}%` } };
    if (usuario.rol === 'gestor') {
      const dependenciaSaf = await this.dependenciaSafDeGestor(usuario.id);
      if (!dependenciaSaf) return [];
      where.id_Dependencia = dependenciaSaf;
    }

    const candidatos = await this.sUsuarios.findAll({
      where,
      order: [['Nombre', 'ASC']],
      limit: 20,
    });

    const resultado: {
      id_usuario_saf: number;
      nombre: string;
      rfc: string;
      dependencia_id: number | null;
      dependencia: string | null;
    }[] = [];
    for (const s of candidatos) {
      const dependenciaId = await this.resolverDependenciaSaf(s.id_Dependencia);
      const dependencia = dependenciaId ? await this.dependencias.findByPk(dependenciaId) : null;
      resultado.push({
        id_usuario_saf: s.id_Usuario,
        nombre: s.Nombre,
        rfc: s.N_Usuario,
        dependencia_id: dependenciaId,
        dependencia: dependencia?.nombre ?? null,
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
      const rfc = await this.rfcDelSolicitante(usuario.id);
      const permitido = rfc
        ? await this.permitidosServicio.findOne({
            where: { servicio_id: problema.servicio_id, rfc },
          })
        : null;
      if (!permitido) {
        throw new ForbiddenException('Tu perfil no puede registrar tickets de ese servicio');
      }
      /* Aunque este en la lista, ahi nunca se registra a nombre de otro. */
      if (dto.a_nombre_de) {
        throw new ForbiddenException('Ese servicio no se puede registrar a nombre de otro usuario');
      }
    }

    if (problema.requiere_texto && !dto.texto?.trim()) {
      throw new BadRequestException('La opcion «Otro» exige capturar la descripcion');
    }

    /* El campo adicional del catalogo. Si pide cuenta de correo se valida aqui
       con la misma regla que la correccion de datos generales. */
    let contexto = dto.contexto?.trim() || null;
    if (esCampoCuentaCorreo(problema.campo_adicional)) {
      const revision = revisaCuentaCorreo(
        contexto,
        dominioInstitucional(this.config.get('CORREO_DOMINIO')),
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
    const ROLES_A_NOMBRE_DE = ['admin', 'operador', 'gestor'];
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
      const datos = await this.datosSaf(dto.a_nombre_de);
      if (!datos) throw new BadRequestException('Ese usuario no existe o ya no esta activo en saf');

      /* El gestor solo registra a nombre de gente de su misma dependencia (saf). */
      if (usuario.rol === 'gestor') {
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

    const ticket = await this.db.transaction(async (tx) => {
      const folio = await this.reglas.siguienteFolio(problema.servicio_id, tx);

      const t = await this.tickets.create(
        {
          folio,
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
          sede_id: quien.sede_id,
          extension: dto.extension?.trim() || quien.extension,
          contexto,
          texto_libre: problema.requiere_texto ? dto.texto!.trim() : null,
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

      await this.reglas.revisaEscalamiento(t, tx);
      await this.reglas.asignar(t, tx);
      return t;
    });

    return this.detalle(ticket.id, usuario);
  }

  /* ==================================================================
     Correccion de los datos generales del reporte

     Es lo unico que el solicitante puede tocar despues del alta. El ticket en
     si —problema, servicio, prioridad, tecnico— no se mueve por aqui: para eso
     estan reclasificar, prioridad y reasignar, que piden motivo y otro rol.
     ================================================================== */

  async actualizarDatos(id: number, dto: DatosGeneralesDto, usuario: UsuarioToken) {
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcance(usuario)) },
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
    if (typeof nuevos.contexto === 'string' && ticket.servicio?.clave === 'CMP' && ticket.tecnico_id) {
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
      this.rfcDelSolicitante(ticket.solicitante_id),
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
      const folio = await this.reglas.siguienteFolio(problema.servicio_id, tx);

      const t = await this.tickets.create(
        {
          folio,
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
    const t = await this.tickets.findOne({
      where: { id, ...(await this.alcance(usuario)) },
      include: [{ model: Servicio, as: 'servicio' }],
    });
    if (!t) throw new NotFoundException('El ticket no existe o no esta a tu alcance');
    return t;
  }

  /**
   * rfc de quien solicito el ticket. solicitante_id no vive siempre en el
   * mismo espacio de ids (ver comentario en el modelo Ticket): primero se
   * busca como usuario.id local; si no hay fila ahi, se asume que es un
   * id_Usuario de saf.s_usuario (externo o registrado "a nombre de otro").
   */
  private async rfcDelSolicitante(solicitanteId: number): Promise<string | null> {
    const local = await this.usuarios.findByPk(solicitanteId, { attributes: ['rfc'] });
    if (local?.rfc) return local.rfc;
    const externo = await this.sUsuarios.findByPk(solicitanteId);
    return externo?.N_Usuario ?? null;
  }

  /**
   * Dependencia/direccion/departamento del solicitante, solo para el
   * dictamen de baja (§ EQUIPO DE COMPUTO): se resuelven al momento desde
   * saf, no se guardan en ticketsv2. Mismo criterio dual que
   * rfcDelSolicitante: primero usuario local (por su rfc), si no existe se
   * asume que solicitante_id ya es un id_Usuario de saf.
   */
  /** Publico: tambien lo usa MonitorService para la cola de "en turno". */
  async datosOrganizacionalesDelSolicitante(solicitanteId: number): Promise<{
    dependencia: string | null;
    direccion: string | null;
    departamento: string | null;
  }> {
    const vacio = { dependencia: null, direccion: null, departamento: null };

    const local = await this.usuarios.findByPk(solicitanteId, { attributes: ['rfc'] });
    const sUsuario = local?.rfc
      ? await this.sUsuarios.findOne({ where: { N_Usuario: local.rfc } })
      : await this.sUsuarios.findByPk(solicitanteId);
    if (!sUsuario) return vacio;

    const [dep, dir, depto] = await Promise.all([
      sUsuario.id_Dependencia ? this.sDependencias.findByPk(sUsuario.id_Dependencia) : null,
      sUsuario.id_Direccion ? this.sDirecciones.findByPk(sUsuario.id_Direccion) : null,
      sUsuario.id_Departamento ? this.sDepartamentos.findByPk(sUsuario.id_Departamento) : null,
    ]);
    return {
      dependencia: dep?.Nombre?.trim() ?? null,
      direccion: dir?.Nombre?.trim() ?? null,
      departamento: (depto?.nombre_completo ?? depto?.Nombre)?.trim() ?? null,
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
    if (!t.contexto) {
      return { bien: null, motivo: 'El ticket no tiene un número de inventario capturado.' };
    }

    const rfc = await this.rfcDelSolicitante(t.solicitante_id);
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
   * Lista de bienes para elegir al corregir el numero de inventario de un
   * ticket ya registrado — mismo mecanismo que al darlo de alta (CMP: un
   * solo equipo; el resto de servicios con inventario: varios), pero sobre
   * el resguardo del SOLICITANTE del ticket, no de quien esta corrigiendo.
   * Mismas reglas que actualizarDatos: solo el solicitante o el admin, y
   * solo con el ticket en espera.
   */
  async bienesParaCorregir(id: number, usuario: UsuarioToken) {
    const ticket = await this.tickets.findOne({
      where: { id, ...(await this.alcance(usuario)) },
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

    const rfc = await this.rfcDelSolicitante(ticket.solicitante_id);
    if (!rfc) {
      return { bienes: [], motivo: 'No se pudo identificar el RFC del solicitante.' };
    }

    return ticket.servicio?.clave === 'CMP'
      ? this.bienesSrv.porRfcCmp(rfc)
      : this.bienesSrv.porRfc(rfc);
  }

  private esTecnicoDe(t: Ticket, usuario: UsuarioToken): boolean {
    return t.tecnico_id === usuario.id;
  }

  private exigeTecnico(t: Ticket, usuario: UsuarioToken) {
    if (usuario.rol === 'admin') return;
    if (!ROLES_TECNICOS.includes(usuario.rol) || !this.esTecnicoDe(t, usuario)) {
      throw new ForbiddenException('Solo el tecnico asignado puede mover este ticket');
    }
  }

  private exigeSolicitante(t: Ticket, usuario: UsuarioToken) {
    if (t.solicitante_id !== usuario.id) {
      throw new ForbiddenException('Solo el solicitante puede realizar esta accion');
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
    if (t.servicio?.clave !== 'CMP' || !t.contexto) return;

    const [tecnicoLocal, rfcSolicitante] = await Promise.all([
      this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] }),
      this.rfcDelSolicitante(t.solicitante_id),
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

  async ponerEnEspera(id: number, motivo: string, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ATENCION, ESTATUS.ASIGNADO]);

    await t.update({
      estatus: ESTATUS.EN_ESPERA,
      f_espera_desde: new Date(),
      motivo_espera: motivo,
    });
    await this.reglas.anota(t.id, usuario.id, 'En espera', motivo);
    this.traza.registra('§5', `${t.folio} EN ESPERA (${motivo}). Reloj de resolucion pausado.`);
    return this.detalle(id, usuario);
  }

  async reanudar(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ESPERA]);

    const pausaSeg = t.f_espera_desde
      ? Math.round((Date.now() - new Date(t.f_espera_desde).getTime()) / 1000)
      : 0;

    await t.update({
      espera_acum_seg: t.espera_acum_seg + pausaSeg,
      f_espera_desde: null,
      estatus: ESTATUS.EN_ATENCION,
    });
    await this.reglas.anota(
      t.id,
      usuario.id,
      'Reanudacion',
      `Estuvo ${Math.round(pausaSeg / 60)} min en espera`,
    );
    this.traza.registra(
      '§5',
      `${t.folio} reanudado. Se descontaron ${Math.round(pausaSeg / 60)} min del tiempo de resolucion.`,
    );
    return this.detalle(id, usuario);
  }

  async resolver(id: number, dto: ResolverDto, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeTecnico(t, usuario);
    this.exigeEstatus(t, [ESTATUS.EN_ATENCION, ESTATUS.EN_ESPERA, ESTATUS.ASIGNADO]);

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

    await t.update({
      estatus: ESTATUS.RESUELTO,
      f_resolucion: new Date(),
      f_espera_desde: null,
      diagnostico: dto.diagnostico,
      solucion: dto.solucion,
      refacciones: dto.refacciones?.trim() || 'Ninguna',
    });
    await this.reglas.anota(
      t.id,
      usuario.id,
      'Resuelto',
      `${dto.diagnostico} → ${dto.solucion}`,
    );

    const objetivos = await this.reglas.objetivos();
    const objetivo = objetivos.get(t.prioridad) ?? 1440;
    const activo = ReglasService.minutosActivos(t);
    this.traza.registra(
      '§10',
      `${t.folio} resuelto en ${activo} min (objetivo ${objetivo} min) · ` +
        `${activo <= objetivo ? 'dentro de tiempo' : 'FUERA DE TIEMPO'}. Notificado al solicitante.`,
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
    if (t.contexto) {
      const [tecnicoLocal, rfcSolicitante] = await Promise.all([
        this.usuarios.findByPk(usuario.id, { attributes: ['rfc'] }),
        this.rfcDelSolicitante(t.solicitante_id),
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
        this.datosOrganizacionalesDelSolicitante(t.solicitante_id),
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
      diagnostico: reparado ? dto.diagnostico : null,
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

  async validar(id: number, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeEstatus(t, [ESTATUS.RESUELTO]);
    if (usuario.rol !== 'admin') this.exigeSolicitante(t, usuario);

    await t.update({
      estatus: ESTATUS.CERRADO,
      f_validacion: new Date(),
      cierre_por_omision: false,
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

  async rechazar(id: number, motivo: string, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    this.exigeSolicitante(t, usuario);
    this.exigeEstatus(t, [ESTATUS.RESUELTO]);

    /* Conserva folio y tecnico: es el mismo problema, no uno nuevo (§5). */
    await t.update({
      estatus: ESTATUS.EN_ATENCION,
      rechazos: t.rechazos + 1,
      f_resolucion: null,
    });
    await this.reglas.anota(t.id, usuario.id, 'Rechazado por el usuario', motivo, undefined, undefined, usuario.nombre);
    this.traza.registra(
      '§5',
      `${t.folio} rechazado por el solicitante (${motivo}). Regresa a EN ATENCION; conserva el folio.`,
    );
    return this.detalle(id, usuario);
  }

  async reabrir(id: number, motivo: string, usuario: UsuarioToken) {
    const t = await this.cargar(id, usuario);
    if (usuario.rol !== 'admin') this.exigeSolicitante(t, usuario);
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
