import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const ROLES_STAFF = ['tecnico', 'jefe', 'admin', 'proveedor', 'operador', 'gestor'];

/**
 * Edicion de personal ya registrado. rfc y nombre no se tocan (vienen de
 * saf); aqui solo se corrige rol, contacto, servicio y alta/baja.
 */
export class ActualizarUsuarioDto {
  @IsIn(ROLES_STAFF, { message: 'El rol debe ser tecnico, jefe, admin, proveedor, operador o gestor' })
  rol!: 'tecnico' | 'jefe' | 'admin' | 'proveedor' | 'operador' | 'gestor';

  /** '' limpia el campo. Sin @IsEmail estricto: solo se valida si viene algo. */
  @IsOptional()
  @ValidateIf((o) => !!o.correo)
  @IsString()
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;

  /** Solo aplica si rol es tecnico; sin valor limpia la especialidad asignada. */
  @IsOptional()
  @IsInt()
  servicio_id?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
