import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  Unique,
  ForeignKey,
  BelongsTo,
  HasMany,
  Index,
} from 'sequelize-typescript';
import {
  Area,
  CatalogoProblema,
  Dependencia,
  Prioridad,
  Sede,
  Servicio,
  Usuario,
} from './catalogos.model';

/* =====================================================================
   Operacion. Equivale a la seccion 2 de 01_esquema_mysql.sql.
   ===================================================================== */

export const ESTATUS = {
  REGISTRADO: 'REGISTRADO',
  ASIGNADO: 'ASIGNADO',
  EN_ATENCION: 'EN_ATENCION',
  EN_ESPERA: 'EN_ESPERA',
  RESUELTO: 'RESUELTO',
  CERRADO: 'CERRADO',
  CANCELADO: 'CANCELADO',
} as const;

export type EstatusClave = (typeof ESTATUS)[keyof typeof ESTATUS];

/** Estatus en los que el ticket ocupa la agenda de un tecnico. */
export const ESTATUS_ABIERTOS: EstatusClave[] = [
  ESTATUS.ASIGNADO,
  ESTATUS.EN_ATENCION,
  ESTATUS.EN_ESPERA,
];

/** Estatus finales: ya no admiten movimientos del ciclo de vida. */
export const ESTATUS_FINALES: EstatusClave[] = [ESTATUS.CERRADO, ESTATUS.CANCELADO];

@Table({ tableName: 'ticket', timestamps: false })
export class Ticket extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  /** §6 inmutable: no se renumera al reclasificar. */
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(30))
  declare folio: string;

  /** Servicio vigente. Los reportes se leen de aqui, nunca del prefijo del folio. */
  @ForeignKey(() => Servicio)
  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare servicio_id: number;

  /** Servicio con el que se registro. */
  @ForeignKey(() => Servicio)
  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare servicio_original_id: number;

  @ForeignKey(() => CatalogoProblema)
  @Column(DataType.INTEGER.UNSIGNED)
  declare problema_id: number | null;

  @ForeignKey(() => Prioridad)
  @AllowNull(false)
  @Column(DataType.CHAR(2))
  declare prioridad: string;

  @Index('ix_ticket_estatus')
  @Default(ESTATUS.REGISTRADO)
  @Column(DataType.STRING(20))
  declare estatus: EstatusClave;

  @ForeignKey(() => Usuario)
  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
  declare solicitante_id: number;

  @ForeignKey(() => Dependencia)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare dependencia_id: number | null;

  @ForeignKey(() => Area)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare area_id: number | null;

  @Column(DataType.STRING(10))
  declare extension: string | null;

  /** §16 sede esperada del servicio, para verificar la ubicacion del reloj. */
  @ForeignKey(() => Sede)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare sede_id: number | null;

  /** Dato del campo adicional (inventario, extension, modelo...). */
  @Column(DataType.STRING(160))
  declare contexto: string | null;

  /** Solo cuando el problema es la opcion Otro. */
  @Column(DataType.TEXT)
  declare texto_libre: string | null;

  @ForeignKey(() => Usuario)
  @Index('ix_ticket_tecnico')
  @Column(DataType.INTEGER.UNSIGNED)
  declare tecnico_id: number | null;

  /** §11 generado por el administrador. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare interno: boolean;

  /** §11 mantenimiento preventivo calendarizado. */
  @Column(DataType.DATEONLY)
  declare fecha_plan: string | null;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare f_registro: Date;

  @Column(DataType.DATE)
  declare f_asignacion: Date | null;

  @Column(DataType.DATE)
  declare f_inicio: Date | null;

  @Column(DataType.DATE)
  declare f_resolucion: Date | null;

  @Column(DataType.DATE)
  declare f_validacion: Date | null;

  @Column(DataType.DATE)
  declare f_cancelacion: Date | null;

  /** Inicio de la pausa vigente. */
  @Column(DataType.DATE)
  declare f_espera_desde: Date | null;

  /** §5 tiempo descontado del reloj de resolucion. */
  @Default(0)
  @Column(DataType.INTEGER.UNSIGNED)
  declare espera_acum_seg: number;

  /** §7.5 sin tecnico disponible. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare en_cola: boolean;

  /** §4 escalamiento automatico a P1. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare escalado: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare reclasificado: boolean;

  /** §10 el usuario no valido en 3 dias. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare cierre_por_omision: boolean;

  @Default(0)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare reasignaciones: number;

  @Default(0)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare reaperturas: number;

  @Default(0)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare rechazos: number;

  @Column(DataType.STRING(400))
  declare diagnostico: string | null;

  @Column(DataType.STRING(400))
  declare solucion: string | null;

  @Column(DataType.STRING(300))
  declare refacciones: string | null;

  @Column(DataType.STRING(200))
  declare motivo_espera: string | null;

  @Column(DataType.STRING(200))
  declare motivo_cancelacion: string | null;

  @BelongsTo(() => Servicio, 'servicio_id')
  declare servicio: Servicio;

  @BelongsTo(() => Servicio, 'servicio_original_id')
  declare servicio_original: Servicio;

  @BelongsTo(() => CatalogoProblema)
  declare problema: CatalogoProblema;

  @BelongsTo(() => Usuario, 'solicitante_id')
  declare solicitante: Usuario;

  @BelongsTo(() => Usuario, 'tecnico_id')
  declare tecnico: Usuario;

  @BelongsTo(() => Dependencia)
  declare dependencia: Dependencia;

  @BelongsTo(() => Area)
  declare area: Area;

  @BelongsTo(() => Sede)
  declare sede: Sede;

  @HasMany(() => TicketTecnico)
  declare equipo: TicketTecnico[];

  @HasMany(() => TicketSesion)
  declare sesiones: TicketSesion[];

  @HasMany(() => TicketBitacora)
  declare bitacora: TicketBitacora[];
}

/** §11 · tickets internos con varios tecnicos. */
@Table({ tableName: 'ticket_tecnico', timestamps: false })
export class TicketTecnico extends Model {
  @PrimaryKey
  @ForeignKey(() => Ticket)
  @Column(DataType.BIGINT.UNSIGNED)
  declare ticket_id: number;

  @PrimaryKey
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER.UNSIGNED)
  declare usuario_id: number;

  @Default('apoyo')
  @Column(DataType.ENUM('responsable', 'apoyo'))
  declare papel: 'responsable' | 'apoyo';

  @BelongsTo(() => Usuario)
  declare usuario: Usuario;
}

/**
 * §16 · reloj checador: una fila por salida a atender.
 * Todo el bloque de ubicacion puede quedar en NULL: la ausencia de coordenada
 * NUNCA impide registrar la sesion.
 */
@Table({ tableName: 'ticket_sesion', timestamps: false })
export class TicketSesion extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Ticket)
  @AllowNull(false)
  @Column(DataType.BIGINT.UNSIGNED)
  declare ticket_id: number;

  @ForeignKey(() => Usuario)
  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
  declare usuario_id: number;

  @AllowNull(false)
  @Column(DataType.DATE)
  declare inicio: Date;

  @Column(DataType.DATE)
  declare fin: Date | null;

  @Column(DataType.STRING(200))
  declare motivo: string | null;

  @Column(DataType.DECIMAL(10, 7))
  declare lat_inicio: number | null;

  @Column(DataType.DECIMAL(10, 7))
  declare lng_inicio: number | null;

  /** Margen de error en metros que reporta el dispositivo. */
  @Column(DataType.SMALLINT.UNSIGNED)
  declare exactitud_inicio: number | null;

  @Column(DataType.DECIMAL(10, 7))
  declare lat_fin: number | null;

  @Column(DataType.DECIMAL(10, 7))
  declare lng_fin: number | null;

  @Column(DataType.SMALLINT.UNSIGNED)
  declare exactitud_fin: number | null;

  @ForeignKey(() => Sede)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare sede_esperada_id: number | null;

  /** Distancia entre la coordenada de inicio y la sede esperada. */
  @Column(DataType.INTEGER.UNSIGNED)
  declare distancia_m: number | null;

  /** 1 dentro del radio · 0 fuera · NULL sin dato de ubicacion. */
  @Column(DataType.BOOLEAN)
  declare en_sitio: boolean | null;

  /** permiso negado, sin senal, tiempo agotado, no soportado. */
  @Column(DataType.STRING(80))
  declare motivo_sin_ubicacion: string | null;

  @BelongsTo(() => Sede)
  declare sede_esperada: Sede;

  @BelongsTo(() => Usuario)
  declare usuario: Usuario;
}

/** §9 · bitacora: toda reasignacion, reclasificacion y cambio de prioridad. */
@Table({ tableName: 'ticket_bitacora', timestamps: false })
export class TicketBitacora extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Ticket)
  @AllowNull(false)
  @Index('ix_bit_ticket')
  @Column(DataType.BIGINT.UNSIGNED)
  declare ticket_id: number;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare fecha: Date;

  /** NULL = accion del sistema. */
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER.UNSIGNED)
  declare usuario_id: number | null;

  @AllowNull(false)
  @Column(DataType.STRING(40))
  declare accion: string;

  @Column(DataType.STRING(400))
  declare detalle: string | null;

  @Column(DataType.STRING(60))
  declare motivo: string | null;

  @Column(DataType.STRING(80))
  declare valor_antes: string | null;

  @Column(DataType.STRING(80))
  declare valor_nuevo: string | null;

  @BelongsTo(() => Usuario)
  declare usuario: Usuario;
}

/** §8 · calendario de disponibilidad. */
@Table({
  tableName: 'calendario_tecnico',
  timestamps: false,
  indexes: [{ name: 'uq_cal', unique: true, fields: ['usuario_id', 'fecha'] }],
})
export class CalendarioTecnico extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Usuario)
  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
  declare usuario_id: number;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare fecha: string;

  @Default('vacaciones')
  @Column(DataType.ENUM('vacaciones', 'descanso', 'incapacidad', 'comision'))
  declare tipo: 'vacaciones' | 'descanso' | 'incapacidad' | 'comision';

  @Column(DataType.STRING(120))
  declare nota: string | null;

  @BelongsTo(() => Usuario)
  declare usuario: Usuario;
}

/** §11 · programa de mantenimiento preventivo. */
@Table({ tableName: 'programa_preventivo', timestamps: false })
export class ProgramaPreventivo extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Servicio)
  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare servicio_id: number;

  @ForeignKey(() => CatalogoProblema)
  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
  declare problema_id: number;

  @AllowNull(false)
  @Column(DataType.STRING(160))
  declare alcance: string;

  @Default(180)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare periodicidad_dias: number;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare proxima_fecha: string;

  @ForeignKey(() => Usuario)
  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
  declare responsable_id: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;

  @BelongsTo(() => Servicio)
  declare servicio: Servicio;

  @BelongsTo(() => CatalogoProblema)
  declare problema: CatalogoProblema;

  @BelongsTo(() => Usuario)
  declare responsable: Usuario;
}
