import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de un rol nuevo en el catalogo. Solo el administrador. */
export class CrearRolDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  clave!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;
}

/** Edicion de un rol ya existente. La clave no se toca: ver CrearServicioDto para el mismo criterio. */
export class ActualizarRolDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre?: string;

  /** Alta/baja logica: false lo oculta del selector de "Registrar usuario" sin borrarlo. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
