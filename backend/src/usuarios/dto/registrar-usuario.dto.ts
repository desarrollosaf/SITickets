import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

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

  /** Se valida contra el catalogo de roles (CatalogoRol) en el service, no aqui con una lista fija. */
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  rol!: string;

  /** Servicios de los que sera tecnico (tecnico_servicio), uno o varios. Solo aplica si rol es tecnico. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  servicio_ids?: number[];

  /** Dependencias que valida (dependencia_validador), una o varias. Solo aplica si rol es validador. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  dependencia_ids?: number[];

  /**
   * Servicios que puede autorizar (servicio_validador), uno o varios. Solo
   * aplica si rol es validador. Sin valor (o []), autoriza cualquier
   * servicio, sin restriccion.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  servicio_ids_validador?: number[];

  /** Solo aplica si rol es gestor: registrar a nombre de gente de cualquier dependencia. */
  @IsOptional()
  @IsBoolean()
  registra_cualquier_dependencia?: boolean;
}
