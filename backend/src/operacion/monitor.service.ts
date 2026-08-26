import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import {
  CalendarioTecnico,
  CatalogoProblema,
  ESTATUS,
  ESTATUS_ABIERTOS,
  ESTATUS_FINALES,
  Servicio,
  TecnicoServicio,
  Ticket,
  TicketSesion,
  Usuario,
} from '../database/models';
import { ReglasService } from '../tickets/reglas.service';
import { TicketsService } from '../tickets/tickets.service';

const ORDEN_PRI: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

const inicioDelDia = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

@Injectable()
export class MonitorService {
  constructor(
    @InjectModel(Ticket) private readonly tickets: typeof Ticket,
    @InjectModel(TicketSesion) private readonly sesiones: typeof TicketSesion,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(Servicio) private readonly servicios: typeof Servicio,
    @InjectModel(TecnicoServicio) private readonly especialidades: typeof TecnicoServicio,
    @InjectModel(CalendarioTecnico) private readonly calendario: typeof CalendarioTecnico,
    private readonly reglas: ReglasService,
    private readonly ticketsSrv: TicketsService,
  ) {}

  /* ==================================================================
     §17 · monitor de turnos: pantalla para proyectar en el area
     ================================================================== */

  async monitor() {
    const objetivos = await this.reglas.objetivos();

    const enCurso = await this.tickets.findAll({
      where: { estatus: { [Op.in]: [ESTATUS.EN_ATENCION, ESTATUS.EN_ESPERA] } },
      include: [
        { model: Servicio, as: 'servicio' },
        { model: CatalogoProblema, as: 'problema' },
        { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
      ],
    });

    const abiertas = await this.sesiones.findAll({ where: { fin: null } });
    const porTicket = new Map(abiertas.map((s) => [Number(s.ticket_id), s]));

    const acumulado = await this.acumuladoEnSitio(enCurso.map((t) => t.id));

    /* La ubicacion de inicio se muestra aunque el reloj ya se haya detenido:
       es donde el tecnico salio a atender, no donde esta ahora mismo. */
    const idsCurso = enCurso.map((t) => t.id);
    const sesionesCurso = idsCurso.length
      ? await this.sesiones.findAll({
          where: { ticket_id: { [Op.in]: idsCurso } },
          order: [['inicio', 'DESC']],
        })
      : [];
    const ultimaSesion = new Map<number, (typeof sesionesCurso)[number]>();
    for (const s of sesionesCurso) {
      const id = Number(s.ticket_id);
      if (!ultimaSesion.has(id)) ultimaSesion.set(id, s);
    }

    const atencion = enCurso
      .map((t) => {
        const sesion = porTicket.get(t.id);
        const ultima = ultimaSesion.get(t.id);
        return {
          id: t.id,
          folio: t.folio,
          prioridad: t.prioridad,
          estatus: t.estatus,
          servicio: t.servicio?.nombre ?? '—',
          problema: t.problema?.descripcion ?? '—',
          tecnico: t.tecnico?.nombre ?? 'Sin asignar',
          reloj_desde: sesion?.inicio ?? null,
          seg_campo: acumulado.get(t.id) ?? 0,
          motivo_espera: t.estatus === ESTATUS.EN_ESPERA ? t.motivo_espera : null,
          lat_inicio: ultima?.lat_inicio ?? null,
          lng_inicio: ultima?.lng_inicio ?? null,
          en_sitio: ultima?.en_sitio ?? null,
          distancia_m: ultima?.distancia_m ?? null,
        };
      })
      .sort((a, b) => {
        const ca = a.reloj_desde ? 0 : 1;
        const cb = b.reloj_desde ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return ORDEN_PRI[a.prioridad] - ORDEN_PRI[b.prioridad];
      });

    /* El turno se ordena por prioridad y, dentro de cada una, por antiguedad:
       un P1 va al frente aunque haya llegado despues. */
    const enTurno = await this.tickets.findAll({
      where: { [Op.or]: [{ estatus: ESTATUS.ASIGNADO }, { en_cola: true }] },
      include: [
        { model: Servicio, as: 'servicio' },
        { model: Usuario, as: 'tecnico', attributes: ['nombre'] },
      ],
    });

    const cola = await Promise.all(
      enTurno
        .sort((a, b) => {
          const d = ORDEN_PRI[a.prioridad] - ORDEN_PRI[b.prioridad];
          if (d !== 0) return d;
          return new Date(a.f_registro).getTime() - new Date(b.f_registro).getTime();
        })
        .map(async (t, i) => {
          /* Departamento del solicitante en saf, no el dependencia_id local
             del ticket: ese catalogo a veces sale vacio o desactualizado. */
          const org = await this.ticketsSrv.datosOrganizacionalesDelSolicitante(t.solicitante_id);
          return {
            turno: i + 1,
            id: t.id,
            folio: t.folio,
            prioridad: t.prioridad,
            en_cola: t.en_cola,
            servicio: t.servicio?.nombre ?? '—',
            departamento: org.departamento ?? '—',
            tecnico: t.tecnico?.nombre ?? null,
            min_espera: Math.round((Date.now() - new Date(t.f_registro).getTime()) / 60_000),
          };
        }),
    );

    return {
      atencion,
      cola,
      rezago: await this.rezago(objetivos),
      finalizados_hoy: await this.finalizadosHoy(),
    };
  }

  /**
   * Cuantos tickets se resolvieron hoy en total, para la franja inferior del
   * monitor. Se cuenta por f_resolucion, no por estatus actual: si un ticket
   * resuelto hoy fue rechazado despues, f_resolucion vuelve a null (lo pone
   * en null `rechazar()`) y deja de contar, que es lo correcto: no quedo
   * finalizado de verdad.
   */
  private finalizadosHoy(): Promise<number> {
    return this.tickets.count({ where: { f_resolucion: { [Op.gte]: inicioDelDia() } } });
  }

  /* ==================================================================
     §13 bloque 1 · rezago del dia
     ================================================================== */

  async rezago(objetivos?: Map<string, number>) {
    const metas = objetivos ?? (await this.reglas.objetivos());
    const hoy = inicioDelDia();

    const abiertos = await this.tickets.findAll({
      where: { estatus: { [Op.notIn]: ESTATUS_FINALES } },
      attributes: [
        'id',
        'estatus',
        'prioridad',
        'f_registro',
        'f_resolucion',
        'espera_acum_seg',
        'f_espera_desde',
        'en_cola',
      ],
    });

    const [total, recibidos_hoy, cerrados_hoy, cierre_por_omision] = await Promise.all([
      this.tickets.count(),
      this.tickets.count({ where: { f_registro: { [Op.gte]: hoy } } }),
      this.tickets.count({ where: { f_validacion: { [Op.gte]: hoy } } }),
      this.tickets.count({ where: { cierre_por_omision: true } }),
    ]);

    const porPrioridad = ['P1', 'P2', 'P3', 'P4'].map((p) => ({
      prioridad: p,
      n: abiertos.filter((t) => t.prioridad === p).length,
      minutos_objetivo: metas.get(p) ?? 1440,
    }));

    return {
      total,
      abiertos: abiertos.length,
      fuera_de_tiempo: abiertos.filter((t) =>
        ReglasService.vencido(t, metas.get(t.prioridad) ?? 1440),
      ).length,
      sin_asignar: abiertos.filter((t) => t.en_cola).length,
      en_espera: abiertos.filter((t) => t.estatus === ESTATUS.EN_ESPERA).length,
      recibidos_hoy,
      cerrados_hoy,
      cierre_por_omision,
      por_prioridad: porPrioridad,
    };
  }

  /* ==================================================================
     §13 bloque 2 · desempeno por tecnico
     ================================================================== */

  async desempeno() {
    const metas = await this.reglas.objetivos();

    const tecnicos = await this.usuarios.findAll({
      where: { activo: true, rol: { [Op.in]: ['tecnico', 'proveedor', 'jefe'] } },
      attributes: ['id', 'nombre', 'rol'],
      include: [
        { model: TecnicoServicio, include: [{ model: Servicio, attributes: ['nombre'] }] },
      ],
      order: [['nombre', 'ASC']],
    });

    const todos = await this.tickets.findAll({
      where: { tecnico_id: { [Op.ne]: null } },
      attributes: [
        'id',
        'tecnico_id',
        'estatus',
        'prioridad',
        'f_registro',
        'f_resolucion',
        'espera_acum_seg',
        'f_espera_desde',
        'reaperturas',
        'rechazos',
      ],
    });

    const sesiones = await this.sesiones.findAll({
      attributes: ['usuario_id', 'inicio', 'fin', 'en_sitio', 'lat_inicio'],
    });

    return Promise.all(
      tecnicos.map(async (u) => {
        const suyos = todos.filter((t) => t.tecnico_id === u.id);
        const resueltos = suyos.filter((t) => t.f_resolucion);
        const enTiempo = resueltos.filter(
          (t) => ReglasService.minutosActivos(t) <= (metas.get(t.prioridad) ?? 1440),
        ).length;

        const mias = sesiones.filter((s) => s.usuario_id === u.id);
        const conGeo = mias.filter((s) => s.en_sitio !== null);
        const segCampo = mias.reduce(
          (a, s) =>
            a +
            ((s.fin ? new Date(s.fin).getTime() : Date.now()) - new Date(s.inicio).getTime()) / 1000,
          0,
        );

        return {
          tecnico_id: u.id,
          tecnico: u.nombre,
          rol: u.rol,
          especialidad:
            (u.especialidades ?? []).map((e) => e.servicio?.nombre).filter(Boolean).join(', ') ||
            '—',
          disponible: await this.reglas.disponible(u.id),
          abiertos: suyos.filter((t) => ESTATUS_ABIERTOS.includes(t.estatus)).length,
          atendidos: resueltos.length,
          min_activo_prom: resueltos.length
            ? Math.round(
                resueltos.reduce((a, t) => a + ReglasService.minutosActivos(t), 0) /
                  resueltos.length,
              )
            : null,
          min_campo: Math.round(segCampo / 60),
          pct_en_tiempo: resueltos.length ? Math.round((enTiempo / resueltos.length) * 100) : null,
          reaperturas: suyos.reduce((a, t) => a + t.reaperturas + t.rechazos, 0),
          sesiones: mias.length,
          /*
           * Indicador de calidad del dato, no de conducta: un porcentaje bajo
           * casi siempre significa permiso de ubicacion no otorgado o mala
           * senal dentro del edificio, no que el tecnico no haya asistido.
           */
          con_ubicacion: mias.filter((s) => s.lat_inicio !== null).length,
          pct_en_sitio: conGeo.length
            ? Math.round((conGeo.filter((s) => s.en_sitio).length / conGeo.length) * 100)
            : null,
        };
      }),
    );
  }

  /* ==================================================================
     §8 · disponibilidad del dia por servicio
     ================================================================== */

  async disponibilidad() {
    const servicios = await this.servicios.findAll({ where: { activo: true, origen: 'usuario' } });
    const especialidades = await this.especialidades.findAll({
      include: [{ model: Usuario, where: { activo: true }, required: true }],
    });

    return Promise.all(
      servicios.map(async (s) => {
        const candidatos = especialidades.filter((e) => e.servicio_id === s.id);
        let libres = 0;
        for (const c of candidatos) {
          if (await this.reglas.disponible(c.usuario_id)) libres++;
        }
        return {
          servicio_id: s.id,
          servicio: s.nombre,
          tecnicos: candidatos.length,
          disponibles: libres,
        };
      }),
    );
  }

  /* ==================================================================
     §13 bloque 3 · insumo para justificar compras
     ================================================================== */

  async compras() {
    /* Agregados planos: son dos conteos, no vale la pena hidratar modelos. */
    const [porProblema, porDependencia] = await Promise.all([
      this.tickets.sequelize!.query<{
        clave: string;
        descripcion: string;
        servicio: string;
        tickets: number;
      }>(
        `SELECT c.clave, c.descripcion, s.nombre AS servicio, COUNT(t.id) AS tickets
           FROM ticket t
           JOIN catalogo_problema c ON c.id = t.problema_id
           JOIN servicio s          ON s.id = t.servicio_id
          GROUP BY c.id, s.id
          ORDER BY tickets DESC
          LIMIT 10`,
        { type: QueryTypes.SELECT },
      ),
      this.tickets.sequelize!.query<{ dependencia: string; tickets: number }>(
        `SELECT d.nombre AS dependencia, COUNT(t.id) AS tickets
           FROM ticket t
           JOIN dependencia d ON d.id = t.dependencia_id
          WHERE t.interno = 0
          GROUP BY d.id
          ORDER BY tickets DESC`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    return {
      problemas: porProblema.map((r) => ({ ...r, tickets: Number(r.tickets) })),
      dependencias: porDependencia.map((r) => ({ ...r, tickets: Number(r.tickets) })),
    };
  }

  /* ==================================================================
     §16 · cumplimiento de ubicacion
     ================================================================== */

  private async acumuladoEnSitio(ids: number[]): Promise<Map<number, number>> {
    if (!ids.length) return new Map();
    const filas = await this.sesiones.findAll({
      where: { ticket_id: { [Op.in]: ids } },
      attributes: ['ticket_id', 'inicio', 'fin'],
    });
    const mapa = new Map<number, number>();
    for (const s of filas) {
      const seg =
        ((s.fin ? new Date(s.fin).getTime() : Date.now()) - new Date(s.inicio).getTime()) / 1000;
      mapa.set(Number(s.ticket_id), (mapa.get(Number(s.ticket_id)) ?? 0) + Math.round(seg));
    }
    return mapa;
  }

  /* ==================================================================
     §8 · calendario de disponibilidad
     ================================================================== */

  async agenda(desdeDias = 2, dias = 21) {
    const desde = new Date(Date.now() - desdeDias * 86_400_000);
    const hasta = new Date(Date.now() + dias * 86_400_000);

    const [tecnicos, bloqueos] = await Promise.all([
      this.usuarios.findAll({
        where: { activo: true, rol: { [Op.in]: ['tecnico', 'proveedor'] } },
        attributes: ['id', 'nombre', 'rol'],
        include: [{ model: TecnicoServicio, include: [{ model: Servicio, attributes: ['nombre'] }] }],
        order: [['nombre', 'ASC']],
      }),
      this.calendario.findAll({
        where: {
          fecha: { [Op.between]: [desde.toISOString().slice(0, 10), hasta.toISOString().slice(0, 10)] },
        },
      }),
    ]);

    return {
      tecnicos: tecnicos.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        especialidad:
          (u.especialidades ?? []).map((e) => e.servicio?.nombre).filter(Boolean).join(', ') || '—',
      })),
      bloqueos: bloqueos.map((b) => ({
        usuario_id: b.usuario_id,
        fecha: b.fecha,
        tipo: b.tipo,
        nota: b.nota,
      })),
    };
  }
}
