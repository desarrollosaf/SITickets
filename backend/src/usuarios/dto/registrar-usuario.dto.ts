import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

const ROLES_STAFF = ['tecnico', 'jefe', 'admin', 'proveedor'];

/**
 * Alta de personal interno. El nombre, rfc y dependencia NO vienen del
 * cuerpo: se leen/resuelven de saf.s_usuario a partir de id_usuario_saf,
 * para que no se puedan falsificar. El admin solo captura rol y los datos
 * que saf no tiene (correo, extension), mas el servicio si el rol es
 * tecnico.
 */
export class RegistrarUsuarioDto {
  @IsInt()
  id_usuario_saf!: number;

  @IsOptional()
  @IsEmail({}, { message: 'Captura un correo valido' })
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;

  @IsIn(ROLES_STAFF, { message: 'El rol debe ser tecnico, jefe, admin o proveedor' })
  rol!: 'tecnico' | 'jefe' | 'admin' | 'proveedor';

  /** Tipo de servicio del que sera tecnico (tecnico_servicio). Solo aplica si rol es tecnico. */
  @IsOptional()
  @IsInt()
  servicio_id?: number;
}
