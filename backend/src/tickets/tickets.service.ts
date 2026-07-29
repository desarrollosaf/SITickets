import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import {
  Area,
  CatalogoProblema,
  Dependencia,
  ESTATUS,
  ESTATUS_FINALES,
  EstatusClave,
  SDependencia,
  Sede,
  Servicio,
  SUsuario,
  Ticket,
  TicketBitacora,
  TicketSesion,
  TicketTecnico,
  Usuario,
} from '../database/models';
import { ReglasService } from './reglas.service';
import { TrazaService } from './traza.service';
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
    @InjectModel(SUsuario, 'saf') private readonly sUsuarios: typeof SUsuario,
    @InjectModel(SDependencia, 'saf') private readonly sDependencias: typeof SDependencia,
    private readonly reglas: ReglasService,
    private readonly traza: TrazaService,
    private readonly config: ConfigService,
  ) {}

  /* ==================================================================
     Consulta. El alcance lo decide el rol, no la pantalla.
     ================================================================== */

  /**
   * Filtro base por rol. Es la pieza que faltaba en la API original: alli
   * cualquiera podia pedir cualquier ticket porque el identificador venia del
   * navegador. Aqui el alcance sale del token y no se puede ampliar por URL.
   */
  private alcance(usuario: UsuarioToken): Record<string, unknown> {
    if (usuario.rol === 'admin') return {};
    if (usuario.rol === 'solicitante') return { solicitante_id: usuario.id };
    if (ROLES_TECNICOS.includes(usuario.rol)) {
      return {
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
    }
    return { id: null };
  }

  async listar(usuario: UsuarioToken, filtros: Record<string, string | undefined> = {}) {
    const where: Record<string, unknown> = { ...this.alcance(usuario) };

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
      where: { id, ...this.alcance(usuario) },
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

    return {
      ...this.resumen(ticket, objetivos, sesiones.length),
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

    const sUsuario = await this.sUsuarios.findByPk(usuario.id);
    if (!sUsuario) throw new ForbiddenException('Sesion invalida');
    return {
      nombre: sUsuario.Nombre,
      dependencia_id: await this.resolverDependenciaSaf(sUsuario.id_Dependencia),
      area_id: null,
      sede_id: null,
      extension: null,
    };
  }

  /** Empareja por nombre exacto contra el catalogo local; null si no hay match. */
  private async resolverDependenciaSaf(idSaf: number | null): Promise<number | null> {
    if (!idSaf) return null;
    const sDep = await this.sDependencias.findByPk(idSaf);
    if (!sDep) return null;
    const local = await this.dependencias.findOne({ where: { nombre: sDep.Nombre.trim() } });
    return local?.id ?? null;
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

    const quien = await this.resolverQuien(usuario);

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
          solicitante_id: usuario.id,
          solicitante_nombre: quien.nombre,
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
        `${problema.servicio.nombre} · ${problema.descripcion}`,
        tx,
        undefined,
        quien.nombre,
      );
      this.traza.registra('§2', `Ticket ${folio} registrado por ${quien.nombre} · ${problema.descripcion}.`);
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
      where: { id, ...this.alcance(usuario) },
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

    /*
     * Dependencia y area viajan juntas: el area tiene que pertenecer a la
     * dependencia, y la sede esperada del §16 se recalcula a partir del area.
     */
    if (dto.dependencia !== undefined || dto.area !== undefined) {
      const depId = dto.dependencia ?? ticket.dependencia_id;
      const dependencia = depId ? await this.dependencias.findByPk(depId) : null;
      if (depId && !dependencia) throw new BadRequestException('La dependencia no existe');

      const areaId = dto.area === undefined ? ticket.area_id : dto.area;
      const area = areaId ? await this.areas.findByPk(areaId) : null;
      if (areaId && !area) throw new BadRequestException('El area no existe');
      if (area && area.dependencia_id !== depId) {
        throw new BadRequestException('El area elegida no pertenece a esa dependencia');
      }

      if (depId !== ticket.dependencia_id) {
        anota('Dependencia', ticket.dependencia?.nombre, dependencia?.nombre);
        nuevos.dependencia_id = depId;
      }
      if (areaId !== ticket.area_id) {
        anota('Area', ticket.area?.nombre, area?.nombre);
        nuevos.area_id = areaId;
        /* La sede no se captura: sale del area, igual que en el alta. */
        const sede = area?.sede_id ?? null;
        if (sede !== ticket.sede_id) nuevos.sede_id = sede;
      }
    }

    if (!cambios.length) throw new BadRequestException('No hay ningun cambio que guardar');

    await this.db.transaction(async (tx) => {
      await ticket.update(nuevos, { transaction: tx });
      for (const c of cambios) {
        /* El detalle nombra el campo; el antes y el despues van en su columna,
           que es como la pantalla de bitacora los presenta. */
        await this.reglas.anota(ticket.id, usuario.id, 'Correccion de datos', c.campo, tx, {
          antes: c.antes.slice(0, 80),
          nuevo: c.nuevo.slice(0, 80),
        });
      }
    });

    this.traza.registra(
      '§9',
      `${ticket.folio}: ${usuario.nombre} corrigio ${cambios.map((c) => c.campo).join(', ')}.`,
    );
    return this.detalle(ticket.id, usuario);
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
      where: { id, ...this.alcance(usuario) },
      include: [{ model: Servicio, as: 'servicio' }],
    });
    if (!t) throw new NotFoundException('El ticket no existe o no esta a tu alcance');
    return t;
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
    return this.detalle(id, usuario);
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
