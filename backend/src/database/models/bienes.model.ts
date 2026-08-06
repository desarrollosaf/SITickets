import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Viven en la base externa `bienes` (sistema de bienes muebles), conexion
 * secundaria de solo lectura — mismo patron que `saf`. Se usan para el
 * servicio EQUIPO DE COMPUTO (CMP): saber que equipo trae asignado cada
 * servidor publico, sin depender de la API remota de SIASAF para
 * pruebas/desarrollo (ver BienesService).
 */
@Table({ tableName: 'estatus_biens', timestamps: false })
export class EstatusBien extends Model {
  @PrimaryKey
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @Column(DataType.STRING(255))
  declare valor: string;
}

@Table({ tableName: 'bien_muebles', timestamps: false })
export class BienMueble extends Model {
  @PrimaryKey
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @Column(DataType.STRING(255))
  declare numero_inventario: string;

  @Column(DataType.STRING(255))
  declare nombre_bien: string;

  /** "Grupo" en el dictamen de baja. */
  @Column(DataType.STRING(255))
  declare material: string | null;

  @Column(DataType.STRING(255))
  declare marca: string | null;

  @Column(DataType.STRING(255))
  declare modelo: string | null;

  /** Clasifica el bien para saber a que rfc "almacen" va una baja (ver BienesService). */
  @Column(DataType.BIGINT.UNSIGNED)
  declare tipo_bien_id: number | null;

  /** 2 = danado/fuera de servicio, entre otros valores del catalogo condicion_biens. */
  @Column(DataType.BIGINT.UNSIGNED)
  declare condicion_bien_id: number | null;
}

/**
 * Quien tiene hoy cada bien bajo resguardo, por rfc. Cada reasignacion en la
 * vida real crea un renglon nuevo y deja el anterior con otro estatus (ver
 * ESTATUS_ASIGNADO/ESTATUS_BAJA en BienesService); nunca se sobrescribe el
 * rfc de un renglon existente.
 */
@Table({ tableName: 'servidor_biens', timestamps: false })
export class ServidorBien extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @Column(DataType.STRING(255))
  declare rfc: string;

  @ForeignKey(() => BienMueble)
  @Column(DataType.BIGINT.UNSIGNED)
  declare bien_mueble_id: number;

  @BelongsTo(() => BienMueble)
  declare bien: BienMueble;

  @ForeignKey(() => EstatusBien)
  @Column(DataType.BIGINT.UNSIGNED)
  declare estatus_bien_id: number;

  @BelongsTo(() => EstatusBien)
  declare estatus: EstatusBien;

  @Column(DataType.DATEONLY)
  declare fecha_asignacion: string | null;

  /** Texto libre; en una baja aqui va la explicacion (SIASAF no guarda un pdf, solo texto). */
  @Column(DataType.TEXT)
  declare observacion_asignacion: string | null;
}
