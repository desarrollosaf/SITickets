import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import {
  CatalogoProblema,
  ESTATUS,
  ProgramaPreventivo,
  Ticket,
  TicketTecnico,
} from '../database/models';
import { ReglasService } from '../tickets/reglas.service';
import { TrazaService } from '../tickets/traza.service';

/**
 * Sustituye al evento horario de MySQL (ev_mantenimiento_horario). Vive en el
 * backend para que la logica quede en un solo lugar y se pueda probar; la base
 * ya no necesita el event_scheduler encendido.
 */
@Injectable()
export class MantenimientoService {
  private readonly log = new Logger('Mantenimiento');

  constructor(
    @InjectConnection() private readonly db: Sequelize,
    @InjectModel(Ticket) private readonly tickets: typeof Ticket,
    @InjectModel(TicketTecnico) private readonly equipos: typeof TicketTecnico,
    @InjectModel(ProgramaPreventivo) private readonly programas: typeof ProgramaPreventivo,
    @InjectModel(CatalogoProblema) private readonly problemas: typeof CatalogoProblema,
    private readonly reglas: ReglasService,
    private readonly traza: TrazaService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cadaHora() {
    await this.reglas.cierrePorOmision();
    await this.generaPreventivos();
  }

  /** §11 · genera los tickets del programa preventivo que ya tocan. */
  async generaPreventivos(): Promise<number> {
    const hoy = new Date().toISOString().slice(0, 10);
    const pendientes = await this.programas.findAll({
      where: { activo: true, proxima_fecha: { [Op.lte]: hoy } },
    });
    if (!pendientes.length) return 0;

    for (const p of pendientes) {
      const problema = await this.problemas.findByPk(p.problema_id);
      if (!problema) continue;

      await this.db.transaction(async (tx) => {
        const folio = await this.reglas.siguienteFolio(p.servicio_id, tx);

        const t = await this.tickets.create(
          {
            folio,
            servicio_id: p.servicio_id,
            servicio_original_id: p.servicio_id,
            problema_id: p.problema_id,
            prioridad: problema.prioridad,
            estatus: ESTATUS.ASIGNADO,
            solicitante_id: p.responsable_id,
            tecnico_id: p.responsable_id,
            interno: true,
            fecha_plan: hoy,
            contexto: p.alcance,
            f_asignacion: new Date(),
          },
          { transaction: tx },
        );

        await this.equipos.create(
          { ticket_id: t.id, usuario_id: p.responsable_id, papel: 'responsable' },
          { transaction: tx },
        );
        await this.reglas.anota(
          t.id,
          null,
          'Alta programada',
          `Programa preventivo · ${p.alcance}`,
          tx,
        );

        const proxima = new Date(Date.now() + p.periodicidad_dias * 86_400_000);
        await p.update({ proxima_fecha: proxima.toISOString().slice(0, 10) }, { transaction: tx });

        this.traza.registra('§11', `Alta programada ${folio} · ${p.alcance}.`);
      });
    }

    this.log.log(`Preventivos generados: ${pendientes.length}.`);
    return pendientes.length;
  }
}
