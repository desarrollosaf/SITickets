import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Viven en la base externa `eservice` (sistema viejo de PHP/Laravel),
 * conexion secundaria — a diferencia de `saf`/`bienes`, esta si se escribe:
 * los endpoints /pythonCompara y /pythonNotificaError insertan/actualizan
 * ahi mismo (ver ImpresorasService). timestamps/soft-delete son de Laravel
 * (created_at/updated_at/deleted_at); se manejan a mano, sin @Table({
 * paranoid: true }), para no heredar comportamiento implicito de Sequelize
 * sobre una tabla que no es nuestra.
 */
@Table({ tableName: 'impresoras', timestamps: false })
export class Impresora extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @Column(DataType.STRING(255))
  declare edificio: string;

  @Column(DataType.STRING(255))
  declare piso: string;

  @Column(DataType.STRING(255))
  declare dependencia: string;

  @Column(DataType.STRING(255))
  declare direccion: string | null;

  @Column(DataType.STRING(255))
  declare area: string;

  @Column(DataType.STRING(255))
  declare marca: string | null;

  @Column(DataType.STRING(255))
  declare modelo: string;

  /** Identificador real que liga con comparacion_impre.serie. */
  @Column(DataType.STRING(255))
  declare serie: string;

  /** 1 = activa. Del lado de Laravel es int, no boolean real. */
  @Column(DataType.INTEGER)
  declare bactivo: number;

  @Column(DataType.STRING(255))
  declare ip: string | null;

  @Column(DataType.DATE)
  declare deleted_at: Date | null;
}

/**
 * Historial de lecturas de tóner: cada visita del script Python inserta un
 * renglon nuevo por impresora (identificada por `serie`), nunca actualiza
 * uno existente — la lectura vigente es la de mayor id por serie (ver
 * ImpresorasService.nivelToner). Todas las columnas de tóner son varchar de
 * origen (asi las guarda Laravel); se parsean a numero en TypeScript, no en
 * SQL, para no arriesgar una comparacion lexicografica.
 */
@Table({ tableName: 'comparacion_impre', timestamps: false })
export class ComparacionImpre extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT.UNSIGNED)
  declare id: number;

  @Column(DataType.STRING(255))
  declare serie: string | null;

  @Column(DataType.STRING(255))
  declare ip: string | null;

  @Column(DataType.STRING(255))
  declare total: string | null;

  @Column(DataType.STRING(255))
  declare total_printer: string | null;

  @Column(DataType.STRING(255))
  declare total_copy: string | null;

  /** Tóner unico (impresoras B/N de un solo cartucho); null si reporta por color. */
  @Column(DataType.STRING(255))
  declare toner_porcent: string | null;

  @Column(DataType.STRING(255))
  declare toner_negro_porcent: string | null;

  @Column(DataType.STRING(255))
  declare toner_residual_porcent: string | null;

  @Column(DataType.STRING(255))
  declare toner_cian_porcent: string | null;

  @Column(DataType.STRING(255))
  declare toner_magenta_porcent: string | null;

  @Column(DataType.STRING(255))
  declare toner_amarillo_porcent: string | null;

  /** Texto libre de origen (no es un DATETIME real en la tabla). */
  @Column(DataType.STRING(255))
  declare fecha_hora: string | null;

  /** 'Actualizado' | 'No actualizado' | null. */
  @Column(DataType.STRING(100))
  declare estado: string | null;

  @Column(DataType.DATE)
  declare created_at: Date | null;

  @Column(DataType.DATE)
  declare updated_at: Date | null;

  @Column(DataType.DATE)
  declare deleted_at: Date | null;
}
