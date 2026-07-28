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
