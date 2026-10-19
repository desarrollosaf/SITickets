import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Edicion de personal ya registrado. rfc y nombre no se tocan (vienen de
 * saf); aqui solo se corrige rol, contacto, servicio y alta/baja.
 */
export class ActualizarUsuarioDto {
  /** Se valida contra el catalogo de roles (CatalogoRol) en el service, no aqui con una lista fija. */
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  rol!: string;

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

  /** Solo aplica si rol es tecnico; sin valor (o []) quita todas las especialidades. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  servicio_ids?: number[];

  /** Solo aplica si rol es validador; sin valor (o []) quita todas las dependencias. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  dependencia_ids?: number[];

  /**
   * Solo aplica si rol es validador; sin valor (o []) deja al validador sin
   * restriccion de servicio (autoriza cualquiera).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  servicio_ids_validador?: number[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
