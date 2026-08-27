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

/* =====================================================================
   Catalogos base. Equivalen a la seccion 1 de 01_esquema_mysql.sql.
   ===================================================================== */

@Table({ tableName: 'dependencia', timestamps: false })
export class Dependencia extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.SMALLINT.UNSIGNED)
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(120))
  declare nombre: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;

  @HasMany(() => Area)
  declare areas: Area[];
}

/** §16 · sedes fisicas, para verificar la ubicacion del reloj checador. */
@Table({ tableName: 'sede', timestamps: false })
export class Sede extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.SMALLINT.UNSIGNED)
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(80))
  declare nombre: string;

  @Column(DataType.STRING(200))
  declare direccion: string | null;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 7))
  declare latitud: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 7))
  declare longitud: number;

  /** Radio de tolerancia en metros. 120 m es un punto de partida en zona urbana densa. */
  @Default(120)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare radio_m: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;
}

@Table({ tableName: 'area', timestamps: false })
export class Area extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.SMALLINT.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Dependencia)
  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare dependencia_id: number;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  declare nombre: string;

  /** Inmueble donde se ubica el area. */
  @ForeignKey(() => Sede)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare sede_id: number | null;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;

  @BelongsTo(() => Dependencia)
  declare dependencia: Dependencia;

  @BelongsTo(() => Sede)
  declare sede: Sede;
}

export type Rol =
  | 'solicitante'
  | 'tecnico'
  | 'jefe'
  | 'admin'
  | 'proveedor'
  | 'operador'
  | 'gestor';

@Table({ tableName: 'usuario', timestamps: false })
export class Usuario extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
  declare id: number;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  declare nombre: string;

  @Column(DataType.STRING(13))
  declare rfc: string | null;

  /** Credencial de acceso. Unica cuando esta presente. */
  @Unique
  @Column(DataType.STRING(120))
  declare correo: string | null;

  /** Hash bcrypt. Nunca sale del backend: se excluye en cada consulta. */
  @Column(DataType.STRING(72))
  declare password_hash: string | null;

  @ForeignKey(() => Dependencia)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare dependencia_id: number | null;

  @ForeignKey(() => Area)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare area_id: number | null;

  @Column(DataType.STRING(10))
  declare extension: string | null;

  @Index('ix_usuario_rol')
  @Default('solicitante')
  @Column(DataType.ENUM('solicitante', 'tecnico', 'jefe', 'admin', 'proveedor', 'operador', 'gestor'))
  declare rol: Rol;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;

  @BelongsTo(() => Dependencia)
  declare dependencia: Dependencia;

  @BelongsTo(() => Area)
  declare area: Area;

  @HasMany(() => TecnicoServicio)
  declare especialidades: TecnicoServicio[];
}

/** §3 · tipos de servicio. */
@Table({ tableName: 'servicio', timestamps: false })
export class Servicio extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.SMALLINT.UNSIGNED)
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(20))
  declare clave: string;

  @AllowNull(false)
  @Column(DataType.STRING(80))
  declare nombre: string;

  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare prefijo_folio: string;

  @Default('usuario')
  @Column(DataType.ENUM('usuario', 'administrador'))
  declare origen: 'usuario' | 'administrador';

  /** 1 = lo atiende proveedor externo. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare externo: boolean;

  /** 1 = admite varios tecnicos. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare multi_tecnico: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;

  /** 1 = solo la gente en ServicioUsuarioPermitido (mas el admin) lo registra. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare restringido: boolean;

  @HasMany(() => CatalogoProblema)
  declare problemas: CatalogoProblema[];

  @HasMany(() => ServicioUsuarioPermitido)
  declare permitidos: ServicioUsuarioPermitido[];
}

/**
 * Excepcion de acceso: cuando servicio.restringido = true, solo estos rfc
 * (mas el admin, siempre) pueden registrar tickets de ese servicio. rfc y
 * nombre viven aqui tal cual saf los entrego al agregarse, sin llave foranea
 * a saf.s_usuario (es otra base) ni a usuario (puede ser gente sin fila local,
 * un solicitante externo).
 */
@Table({ tableName: 'servicio_usuario_permitido', timestamps: false })
export class ServicioUsuarioPermitido extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Servicio)
  @AllowNull(false)
  @Unique('uq_servicio_rfc')
  @Column(DataType.SMALLINT.UNSIGNED)
  declare servicio_id: number;

  @AllowNull(false)
  @Unique('uq_servicio_rfc')
  @Column(DataType.STRING(20))
  declare rfc: string;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  declare nombre: string;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare creado_en: Date;

  @BelongsTo(() => Servicio)
  declare servicio: Servicio;
}

/** §7 · especialidad del tecnico. */
@Table({ tableName: 'tecnico_servicio', timestamps: false })
export class TecnicoServicio extends Model {
  @PrimaryKey
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER.UNSIGNED)
  declare usuario_id: number;

  @PrimaryKey
  @ForeignKey(() => Servicio)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare servicio_id: number;

  /** 1 = solo se activa si no hay titular disponible. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare suplente: boolean;

  @BelongsTo(() => Usuario)
  declare usuario: Usuario;

  @BelongsTo(() => Servicio)
  declare servicio: Servicio;
}

/** §4 · prioridades y tiempos objetivo. */
@Table({ tableName: 'prioridad', timestamps: false })
export class Prioridad extends Model {
  @PrimaryKey
  @Column(DataType.CHAR(2))
  declare clave: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  declare nombre: string;

  @AllowNull(false)
  @Column(DataType.TINYINT.UNSIGNED)
  declare orden: number;

  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare minutos_respuesta: number;

  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare minutos_resolucion: number;
}

/** §5 · ciclo de vida. */
@Table({ tableName: 'estatus', timestamps: false })
export class Estatus extends Model {
  @PrimaryKey
  @Column(DataType.STRING(20))
  declare clave: string;

  @AllowNull(false)
  @Column(DataType.STRING(40))
  declare nombre: string;

  @AllowNull(false)
  @Column(DataType.TINYINT.UNSIGNED)
  declare orden: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare final: boolean;
}

/** §2 · catalogo de problemas: sustituye al campo de texto libre. */
@Table({ tableName: 'catalogo_problema', timestamps: false })
export class CatalogoProblema extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
  declare id: number;

  @ForeignKey(() => Servicio)
  @AllowNull(false)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare servicio_id: number;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(20))
  declare clave: string;

  /** Texto que ve el usuario en el select. */
  @AllowNull(false)
  @Column(DataType.STRING(160))
  declare descripcion: string;

  @ForeignKey(() => Prioridad)
  @AllowNull(false)
  @Column(DataType.CHAR(2))
  declare prioridad: string;

  /** Dato de contexto que se solicita al elegir esta opcion. */
  @Column(DataType.STRING(60))
  declare campo_adicional: string | null;

  /** 1 solo en la opcion Otro. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare requiere_texto: boolean;

  @Default(0)
  @Column(DataType.SMALLINT.UNSIGNED)
  declare orden: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;

  @BelongsTo(() => Servicio)
  declare servicio: Servicio;
}

@Table({ tableName: 'motivo_reasignacion', timestamps: false })
export class MotivoReasignacion extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.TINYINT.UNSIGNED)
  declare id: number;

  @AllowNull(false)
  @Column(DataType.STRING(60))
  declare nombre: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean;
}

/** §6 · series de folio, una por prefijo y ejercicio. */
@Table({ tableName: 'folio_serie', timestamps: false })
export class FolioSerie extends Model {
  @PrimaryKey
  @Column(DataType.STRING(10))
  declare prefijo: string;

  @PrimaryKey
  @Column(DataType.SMALLINT.UNSIGNED)
  declare anio: number;

  @Default(0)
  @Column(DataType.INTEGER.UNSIGNED)
  declare consecutivo: number;
}
