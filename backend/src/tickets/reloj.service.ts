import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize, Transaction } from 'sequelize';
import { ESTATUS, Sede, Servicio, Ticket, TicketSesion } from '../database/models';
import { ReglasService } from './reglas.service';
import { TrazaService } from './traza.service';
import { TicketsService } from './tickets.service';
import type { UsuarioToken } from '../common/usuario-actual.decorator';
import { RelojFinDto, RelojInicioDto } from './dto/tickets.dto';

interface Geo {
  lat: number | null;
  lng: number | null;
  exactitud: number | null;
  motivo_sin_ubicacion: string | null;
}

/** Normaliza lo que manda el navegador. Sin coordenada no hay error: hay motivo. */
function geoDe(dto: { lat?: number; lng?: number; exactitud?: number; motivo_sin_ubicacion?: string }): Geo {
  const hay = typeof dto.lat === 'number' && typeof dto.lng === 'number';
  return {
    lat: hay ? Number(dto.lat!.toFixed(7)) : null,
    lng: hay ? Number(dto.lng!.toFixed(7)) : null,
    exactitud: typeof dto.exactitud === 'number' ? Math.round(dto.exactitud) : null,
    motivo_sin_ubicacion: hay ? null : (dto.motivo_sin_ubicacion?.slice(0, 80) ?? 'no informado'),
  };
}

/**
 * §16 · Reloj checador.
 *
 * Principio de la especificacion: la ubicacion se REGISTRA, no se exige. Si el
 * navegador no la entrega, el reloj arranca igual y se guarda el motivo. Nunca
 * se bloquea al tecnico por falta de coordenada: en interiores el GPS falla con
 * frecuencia y castigarlo produciria un dato peor, no mejor.
 */
@Injectable()
export class RelojService {
  constructor(
    @InjectConnection() private readonly db: Sequelize,
    @InjectModel(Ticket) private readonly tickets: typeof Ticket,
    @InjectModel(TicketSesion) private readonly sesiones: typeof TicketSesion,
    @InjectModel(Sede) private readonly sedes: typeof Sede,
    private readonly reglas: ReglasService,
    private readonly traza: TrazaService,
    private readonly ticketsSrv: TicketsService,
  ) {}

  private async mio(id: number, usuario: UsuarioToken): Promise<Ticket> {
    const t = await this.tickets.findByPk(id);
    if (!t) throw new NotFoundException('El ticket no existe');
    if (t.tecnico_id !== usuario.id && usuario.rol !== 'admin') {
      throw new ForbiddenException('El reloj solo lo maneja el tecnico asignado');
    }
    return t;
  }

  async iniciar(id: number, dto: RelojInicioDto, usuario: UsuarioToken) {
    const t = await this.mio(id, usuario);
    if ([ESTATUS.CERRADO, ESTATUS.CANCELADO, ESTATUS.RESUELTO].includes(t.estatus as never)) {
      throw new BadRequestException('El ticket ya no admite salidas a sitio');
    }
    /* Primera vez que se atiende: si el ticket pasa por aqui en vez de por
       TicketsService.iniciar() (el boton "Atender ticket" arranca el reloj
       solo si no estaba corriendo), el aviso a bienes de todos modos tiene
       que salir. */
    const primeraAtencion = t.estatus === ESTATUS.ASIGNADO;

    const geo = geoDe(dto);

    await this.db.transaction(async (tx) => {
      /* Un tecnico solo puede tener un reloj corriendo: la sesion anterior se
         detiene sola y su ticket queda EN ESPERA, no abandonado. */
      const abierta = await this.sesiones.findOne({
        where: { usuario_id: usuario.id, fin: null, ticket_id: { [Op.ne]: t.id } },
        transaction: tx,
      });
      if (abierta) {
        await this.detenerSesion(abierta, 'Cambio de servicio', null, tx);
        const otro = await this.tickets.findByPk(abierta.ticket_id, { transaction: tx });
        if (otro && otro.estatus === ESTATUS.EN_ATENCION) {
          await otro.update(
            {
              estatus: ESTATUS.EN_ESPERA,
              f_espera_desde: new Date(),
              motivo_espera: 'El tecnico salio a atender otro ticket',
            },
            { transaction: tx },
          );
          this.traza.registra(
            '§16',
            `Un tecnico solo puede tener un reloj activo. ${otro.folio} se detuvo y quedo EN ESPERA.`,
          );
        }
      }

      /* Si venia en espera, la pausa se acumula y el reloj de resolucion vuelve a correr. */
      if (t.estatus === ESTATUS.EN_ESPERA && t.f_espera_desde) {
        const pausa = Math.round((Date.now() - new Date(t.f_espera_desde).getTime()) / 1000);
        await t.update(
          { espera_acum_seg: t.espera_acum_seg + pausa, f_espera_desde: null },
          { transaction: tx },
        );
      }

      const ubic = await this.evalua(t.sede_id, geo, tx);

      await this.sesiones.create(
        {
          ticket_id: t.id,
          usuario_id: usuario.id,
          inicio: new Date(),
          lat_inicio: geo.lat,
          lng_inicio: geo.lng,
          exactitud_inicio: geo.exactitud,
          sede_esperada_id: t.sede_id,
          distancia_m: ubic.distancia,
          en_sitio: ubic.en_sitio,
          motivo_sin_ubicacion: geo.motivo_sin_ubicacion,
        },
        { transaction: tx },
      );

      /* El estatus cambia solo. El tecnico no tiene que acordarse de moverlo. */
      await t.update(
        { estatus: ESTATUS.EN_ATENCION, f_inicio: t.f_inicio ?? new Date() },
        { transaction: tx },
      );

      await this.reglas.anota(
        t.id,
        usuario.id,
        'Reloj iniciado',
        `Salida a atender el servicio · el estatus cambio a EN ATENCION automaticamente · ${ubic.texto}`,
        tx,
      );
      this.traza.registra('§16', `Reloj activo en ${t.folio} · ${usuario.nombre}. ${ubic.texto}`);
    });

    /* Fuera de la transaccion: implica una llamada HTTP a SIASAF, no debe
       tener una conexion de base de datos detenida esperandola. */
    if (primeraAtencion) {
      const conServicio = await this.tickets.findByPk(t.id, {
        include: [{ model: Servicio, as: 'servicio' }],
      });
      if (conServicio) await this.ticketsSrv.marcarCmpEnMantenimiento(conServicio, usuario);
    }

    return this.ticketsSrv.detalle(id, usuario);
  }

  async detener(id: number, dto: RelojFinDto, usuario: UsuarioToken) {
    const t = await this.mio(id, usuario);
    const geo = geoDe(dto);

    const sesion = await this.sesiones.findOne({
      where: { ticket_id: t.id, usuario_id: usuario.id, fin: null },
      order: [['inicio', 'DESC']],
    });
    if (!sesion) throw new BadRequestException('No hay un reloj corriendo en este ticket');

    await this.db.transaction(async (tx) => {
      const segundos = await this.detenerSesion(sesion, dto.motivo ?? null, geo, tx);

      await this.reglas.anota(
        t.id,
        usuario.id,
        'Reloj detenido',
        `${Math.round(segundos / 60)} min en sitio${dto.motivo ? ' · ' + dto.motivo : ''}`,
        tx,
      );

      if (dto.en_espera) {
        await t.update(
          {
            estatus: ESTATUS.EN_ESPERA,
            f_espera_desde: new Date(),
            motivo_espera: dto.motivo ?? 'En espera tras la visita',
          },
          { transaction: tx },
        );
      }
      this.traza.registra(
        '§16',
        `Reloj detenido en ${t.folio}: ${Math.round(segundos / 60)} min en sitio.`,
      );
    });

    return this.ticketsSrv.detalle(id, usuario);
  }

  private async detenerSesion(
    sesion: TicketSesion,
    motivo: string | null,
    geo: Geo | null,
    tx: Transaction,
  ): Promise<number> {
    const fin = new Date();
    await sesion.update(
      {
        fin,
        motivo,
        lat_fin: geo?.lat ?? null,
        lng_fin: geo?.lng ?? null,
        exactitud_fin: geo?.exactitud ?? null,
      },
      { transaction: tx },
    );
    return Math.round((fin.getTime() - new Date(sesion.inicio).getTime()) / 1000);
  }

  /**
   * Compara la coordenada contra la sede esperada del ticket. Se suma el margen
   * de error del dispositivo: no se marca fuera de sitio a quien pudo estar
   * dentro pero con una lectura imprecisa.
   */
  private async evalua(
    sedeId: number | null,
    geo: Geo,
    tx: Transaction,
  ): Promise<{ distancia: number | null; en_sitio: boolean | null; texto: string }> {
    if (geo.lat === null || geo.lng === null) {
      return {
        distancia: null,
        en_sitio: null,
        texto: `sin dato de ubicacion (${geo.motivo_sin_ubicacion})`,
      };
    }
    if (!sedeId) {
      return { distancia: null, en_sitio: null, texto: 'sin sede asignada para comparar' };
    }

    const sede = await this.sedes.findByPk(sedeId, { transaction: tx });
    if (!sede) return { distancia: null, en_sitio: null, texto: 'sin sede asignada para comparar' };

    const distancia = ReglasService.distanciaM(
      geo.lat,
      geo.lng,
      Number(sede.latitud),
      Number(sede.longitud),
    );
    const en_sitio = distancia <= sede.radio_m + (geo.exactitud ?? 0);

    return {
      distancia,
      en_sitio,
      texto: en_sitio
        ? `ubicacion confirmada a ${distancia} m de ${sede.nombre}`
        : `registrado a ${distancia} m de ${sede.nombre} (fuera del radio; se registra igual)`,
    };
  }
}
