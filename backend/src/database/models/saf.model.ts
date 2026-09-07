import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Vive en la base externa `saf`, conexion secundaria de solo lectura.
 * Solo se leen rfc/password para validar el login; el resto de columnas
 * que tenga esa tabla no le importan a este sistema.
 */
@Table({ tableName: 'users_safs', timestamps: false })
export class UserSaf extends Model {
  @PrimaryKey
  @Column(DataType.STRING(255))
  declare rfc: string;

  @Column(DataType.STRING(255))
  declare password: string;
}

/**
 * Padron de todo el personal registrado (no solo tecnicos/admins). Liga con
 * `users_safs` por `N_Usuario = rfc`. Da el nombre y la dependencia de
 * cualquiera que no tenga fila en `ticketsv2.usuario` (solicitante externo).
 */
@Table({ tableName: 's_usuario', timestamps: false })
export class SUsuario extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id_Usuario: number;

  @Column(DataType.STRING(100))
  declare N_Usuario: string;

  @Column(DataType.TEXT)
  declare Nombre: string;

  /** 1 = activo, 0 = baja. Se revalida en cada peticion, no solo en el login. */
  @Column(DataType.INTEGER)
  declare Estado: number | null;

  @Column(DataType.INTEGER)
  declare id_Dependencia: number | null;

  /** Solo se leen para el dictamen de baja (§ EQUIPO DE COMPUTO); no se usan para nada mas. */
  @Column(DataType.INTEGER)
  declare id_Direccion: number | null;

  @Column(DataType.INTEGER)
  declare id_Departamento: number | null;
}

/** Catalogo de dependencias de saf. Solo se usa para emparejar por nombre con ticketsv2.dependencia. */
@Table({ tableName: 't_dependencia', timestamps: false })
export class SDependencia extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id_Dependencia: number;

  @Column(DataType.STRING(100))
  declare Nombre: string;
}

/** Nombre de la direccion del solicitante (dictamen de baja, ficha del ticket). */
@Table({ tableName: 't_direccion', timestamps: false })
export class SDireccion extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id_Direccion: number;

  @Column(DataType.STRING(100))
  declare Nombre: string;

  /** Nombre largo: es lo que usa eservice.impresoras.area para identificar la direccion. */
  @Column(DataType.STRING(250))
  declare nombre_completo: string | null;
}

/** Solo para el dictamen de baja: nombre del departamento del solicitante. */
@Table({ tableName: 't_departamento', timestamps: false })
export class SDepartamento extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id_Departamento: number;

  @Column(DataType.STRING(100))
  declare Nombre: string;

  @Column(DataType.STRING(500))
  declare nombre_completo: string | null;
}

/** Domicilio fisico (calle, colonia, ciudad, C.P.) de un edificio del Congreso. */
@Table({ tableName: 't_ubicacion', timestamps: false })
export class SUbicacion extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.TEXT)
  declare valor: string;
}

/** Liga un departamento con el domicilio (SUbicacion) del edificio donde esta. */
@Table({ tableName: 't_ubicacion_departamento', timestamps: false })
export class SUbicacionDepartamento extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.INTEGER)
  declare departamento_id: number;

  @Column(DataType.INTEGER)
  declare ubicacion_id: number;
}
