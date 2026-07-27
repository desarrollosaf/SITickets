import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Op, Sequelize, Transaction } from 'sequelize';
import {
  CalendarioTecnico,
  CatalogoProblema,
  ESTATUS,
  ESTATUS_ABIERTOS,
  FolioSerie,
  Prioridad,
  Servicio,
  TecnicoServicio,
  Ticket,
  TicketBitacora,
  Usuario,
} from '../database/models';
import { TrazaService } from './traza.service';

/** Ventana de concentracion del escalamiento automatico (§4). */
const VENTANA_ESCALAMIENTO_MIN = 60;

/** Tickets simultaneos que disparan la incidencia mayor, sin contar el nuevo. */
const UMBRAL_ESCALAMIENTO = 2;

/** §10 · dias naturales que tiene el solicitante para validar antes del cierre. */
const DIAS_CIERRE_POR_OMISION = 3;

const ISO = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class ReglasService {
  private readonly log = new Logger('Reglas');

  constructor(
    @InjectConnection() private readonly db: Sequelize,
    @InjectModel(Ticket) private readonly tickets: typeof Ticket,
    @InjectModel(FolioSerie) private readonly series: typeof FolioSerie,
    @InjectModel(Servicio) private readonly servicios: typeof Servicio,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(TecnicoServicio) private readonly especialidades: typeof TecnicoServicio,
    @InjectModel(CalendarioTecnico) private readonly calendario: typeof CalendarioTecnico,
    @InjectModel(CatalogoProblema) private readonly problemas: typeof CatalogoProblema,
    @InjectModel(Prioridad) private readonly prioridades: typeof Prioridad,
    @InjectModel(TicketBitacora) private readonly bitacora: typeof TicketBitacora,
    private readonly traza: TrazaService,
  ) {}

  /* ------------------------------------------------------------------
     §6 · folio inmutable y sin huecos
     ------------------------------------------------------------------ */

  /**
   * Reserva el siguiente consecutivo de la serie. El bloqueo pesimista sobre el
   * renglon de folio_serie es lo que evita que dos altas simultaneas se lleven
   * el mismo numero; por eso exige transaccion y no admite llamarse fuera de una.
   */
  async siguienteFolio(servicioId: number, tx: Transaction): Promise<string> {
    const servicio = await this.servicios.findByPk(servicioId, { transaction: tx });
    if (!servicio) throw new Error(`Servicio ${servicioId} inexistente`);

    const anio = new Date().getFullYear();
    const [serie] = await this.series.findOrCreate({
      where: { prefijo: servicio.prefijo_folio, anio },
      defaults: { prefijo: servicio.prefijo_folio, anio, consecutivo: 0 },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    const consecutivo = serie.consecutivo + 1;
    await serie.update({ consecutivo }, { transaction: tx });

    return `TK/${servicio.prefijo_folio}/${consecutivo}/${anio}`;
  }

  /* ------------------------------------------------------------------
     §8 · disponibilidad
     ------------------------------------------------------------------ */

  /** Fin de semana o dia bloqueado en el calendario. */
  async disponible(usuarioId: number, fecha = new Date()): Promise<boolean> {
    const dia = fecha.getDay();
    if (dia === 0 || dia === 6) return false;
    const bloqueo = await this.calendario.count({
      where: { usuario_id: usuarioId, fecha: ISO(fecha) },
    });
    return bloqueo === 0;
  }

  /* ------------------------------------------------------------------
     §7 · asignacion automatica
     ------------------------------------------------------------------ */

  /**
   * Elige tecnico por: 1 especialidad · 2 disponible en calendario ·
   * 3 menos tickets abiertos · 4 rotacion justa (quien lleva mas sin recibir).
   *
   * Los suplentes solo entran cuando ningun titular esta disponible. Si no hay
   * nadie, el ticket queda EN COLA y se avisa: nunca se asigna a la fuerza a
   * alguien de otra especialidad.
   */
  async asignar(ticket: Ticket, tx: Transaction, motivoExtra?: string): Promise<number | null> {
    const candidatos = await this.especialidades.findAll({
      where: { servicio_id: ticket.servicio_id },
      include: [{ model: Usuario, where: { activo: true }, required: true }],
      transaction: tx,
    });

    if (!candidatos.length) {
      await this.dejarEnCola(ticket, tx, 'No hay tecnico con esa especialidad.');
      const servicio = await this.servicios.findByPk(ticket.servicio_id, { transaction: tx });
      this.traza.registra(
        '§7.5',
        `${ticket.folio} queda EN COLA: no hay tecnico con la especialidad «${servicio?.nombre}».`,
      );
      return null;
    }

    const hoy = new Date();
    const disponibles: typeof candidatos = [];
    for (const c of candidatos) {
      if (await this.disponible(c.usuario_id, hoy)) disponibles.push(c);
    }

    /* Los suplentes se reservan para cuando ningun titular puede tomarlo. */
    const titulares = disponibles.filter((c) => !c.suplente);
    const elegibles = titulares.length ? titulares : disponibles;

    if (!elegibles.length) {
      await this.dejarEnCola(
        ticket,
        tx,
        `Los ${candidatos.length} tecnico(s) de la especialidad tienen el dia bloqueado.`,
      );
      this.traza.registra(
        '§7.5',
        `${ticket.folio} queda EN COLA: los ${candidatos.length} tecnico(s) de la especialidad ` +
          'tienen el dia bloqueado. Se notifica al administrador.',
      );
      return null;
    }

    const carga = await Promise.all(
      elegibles.map(async (c) => ({
        id: c.usuario_id,
        nombre: c.usuario.nombre,
        abiertos: await this.tickets.count({
          where: { tecnico_id: c.usuario_id, estatus: { [Op.in]: ESTATUS_ABIERTOS } },
          transaction: tx,
        }),
        ultima: await this.tickets.max<Date | null, Ticket>('f_asignacion', {
          where: { tecnico_id: c.usuario_id },
          transaction: tx,
        }),
      })),
    );

    carga.sort((a, b) => {
      if (a.abiertos !== b.abiertos) return a.abiertos - b.abiertos; // §7.3
      const ta = a.ultima ? new Date(a.ultima).getTime() : 0;
      const tb = b.ultima ? new Date(b.ultima).getTime() : 0;
      return ta - tb; // §7.4 rotacion justa
    });

    const elegido = carga[0];
    await ticket.update(
      {
        tecnico_id: elegido.id,
        en_cola: false,
        estatus: ESTATUS.ASIGNADO,
        f_asignacion: new Date(),
      },
      { transaction: tx },
    );

    const detalle =
      carga.length > 1
        ? `entre ${carga.length} disponibles, es quien tiene menos tickets abiertos (${elegido.abiertos})`
        : 'es el unico tecnico disponible de la especialidad';

    await this.anota(ticket.id, null, 'Asignacion automatica', `${elegido.nombre} · ${detalle}`, tx);
    this.traza.registra(
      '§7.3',
      `${ticket.folio} → ${elegido.nombre}: ${detalle}.${motivoExtra ? ' ' + motivoExtra : ''}`,
    );
    return elegido.id;
  }

  private async dejarEnCola(ticket: Ticket, tx: Transaction, motivo: string) {
    await ticket.update(
      { en_cola: true, tecnico_id: null, estatus: ESTATUS.REGISTRADO },
      { transaction: tx },
    );
    await this.anota(
      ticket.id,
      null,
      'Sin asignar',
      `${motivo} Requiere asignacion manual.`,
      tx,
    );
  }

  /* ------------------------------------------------------------------
     §4 · escalamiento automatico por concentracion
     ------------------------------------------------------------------ */

  /**
   * Tres o mas tickets del mismo servicio y dependencia en 60 minutos dejan de
   * ser incidentes sueltos: son una incidencia mayor y suben todos a P1.
   */
  async revisaEscalamiento(ticket: Ticket, tx: Transaction): Promise<boolean> {
    const desde = new Date(Date.now() - VENTANA_ESCALAMIENTO_MIN * 60_000);

    const hermanos = await this.tickets.findAll({
      where: {
        id: { [Op.ne]: ticket.id },
        servicio_id: ticket.servicio_id,
        dependencia_id: ticket.dependencia_id,
        estatus: { [Op.notIn]: [ESTATUS.CERRADO, ESTATUS.CANCELADO] },
        f_registro: { [Op.gte]: desde },
      },
      transaction: tx,
    });

    if (hermanos.length < UMBRAL_ESCALAMIENTO || ticket.prioridad === 'P1') return false;

    for (const t of [ticket, ...hermanos]) {
      if (t.prioridad !== 'P1') {
        await t.update({ prioridad: 'P1', escalado: true }, { transaction: tx });
      }
    }

    const total = hermanos.length + 1;
    await this.anota(
      ticket.id,
      null,
      'Escalamiento automatico',
      `Incidencia mayor: ${total} tickets del mismo servicio y dependencia en ${VENTANA_ESCALAMIENTO_MIN} minutos`,
      tx,
    );
    this.traza.registra(
      '§4',
      `Incidencia mayor detectada: ${total} tickets del mismo servicio y dependencia ` +
        `en ${VENTANA_ESCALAMIENTO_MIN} min. Escalados a P1.`,
    );
    return true;
  }

  /* ------------------------------------------------------------------
     §5 · relojes
     ------------------------------------------------------------------ */

  /**
   * Tiempo que corre contra el objetivo: ciclo total menos lo que el ticket
   * paso EN ESPERA. La pausa no se le carga al tecnico porque la causa suele
   * ser ajena (refaccion, autorizacion, usuario ausente).
   */
  static minutosActivos(t: Ticket): number {
    const fin = t.f_resolucion ? new Date(t.f_resolucion).getTime() : Date.now();
    const ciclo = fin - new Date(t.f_registro).getTime();
    const espera =
      t.espera_acum_seg * 1000 +
      (t.f_espera_desde ? Date.now() - new Date(t.f_espera_desde).getTime() : 0);
    return Math.max(0, Math.round((ciclo - espera) / 60_000));
  }

  static minutosCiclo(t: Ticket): number {
    const fin = t.f_resolucion ? new Date(t.f_resolucion).getTime() : Date.now();
    return Math.max(0, Math.round((fin - new Date(t.f_registro).getTime()) / 60_000));
  }

  /** Un ticket ya cerrado, cancelado o resuelto no sigue acumulando retraso. */
  static vencido(t: Ticket, minutosObjetivo: number): boolean {
    const fuera: string[] = [ESTATUS.CERRADO, ESTATUS.CANCELADO, ESTATUS.RESUELTO];
    if (fuera.includes(t.estatus)) return false;
    return ReglasService.minutosActivos(t) > minutosObjetivo;
  }

  async objetivos(): Promise<Map<string, number>> {
    const p = await this.prioridades.findAll();
    return new Map(p.map((x) => [x.clave, x.minutos_resolucion]));
  }

  /* ------------------------------------------------------------------
     §10 · cierre por omision
     ------------------------------------------------------------------ */

  /**
   * Cierra lo que el solicitante no valido dentro del plazo. Se marca aparte
   * (cierre_por_omision) porque un cierre por silencio no es lo mismo que uno
   * confirmado, y el tablero debe poder distinguirlos.
   */
  async cierrePorOmision(): Promise<number> {
    const limite = new Date(Date.now() - DIAS_CIERRE_POR_OMISION * 86_400_000);
    const vencidos = await this.tickets.findAll({
      where: { estatus: ESTATUS.RESUELTO, f_resolucion: { [Op.lt]: limite } },
    });
    if (!vencidos.length) return 0;

    await this.db.transaction(async (tx) => {
      for (const t of vencidos) {
        await t.update(
          { estatus: ESTATUS.CERRADO, cierre_por_omision: true, f_validacion: new Date() },
          { transaction: tx },
        );
        await this.anota(
          t.id,
          null,
          'Cierre automatico',
          `El usuario no valido dentro de los ${DIAS_CIERRE_POR_OMISION} dias`,
          tx,
        );
        this.traza.registra(
          '§10',
          `${t.folio} cerrado por omision: el solicitante no valido en ${DIAS_CIERRE_POR_OMISION} dias.`,
        );
      }
    });
    this.log.log(`Cierre por omision: ${vencidos.length} ticket(s).`);
    return vencidos.length;
  }

  /* ------------------------------------------------------------------
     bitacora (§9)
     ------------------------------------------------------------------ */

  /** usuario_id nulo = accion del sistema, no de una persona. */
  async anota(
    ticketId: number,
    usuarioId: number | null,
    accion: string,
    detalle?: string | null,
    tx?: Transaction,
    extra?: { motivo?: string; antes?: string; nuevo?: string },
  ): Promise<void> {
    await this.bitacora.create(
      {
        ticket_id: ticketId,
        usuario_id: usuarioId,
        accion,
        detalle: detalle ?? null,
        motivo: extra?.motivo ?? null,
        valor_antes: extra?.antes ?? null,
        valor_nuevo: extra?.nuevo ?? null,
      },
      { transaction: tx },
    );
  }

  /* ------------------------------------------------------------------
     §16 · distancia a la sede esperada
     ------------------------------------------------------------------ */

  /** Haversine en metros. */
  static distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r;
    const dLng = (lng2 - lng1) * r;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }
}
