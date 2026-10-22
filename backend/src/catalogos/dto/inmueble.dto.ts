import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Alta de un inmueble nuevo en el catalogo. Solo el administrador. */
export class CrearInmuebleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  dependencia!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  ubicacion!: string;

  @IsIn(['propio', 'renta'])
  propiedad!: 'propio' | 'renta';

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  tipo!: string;
}

/** Edicion de un inmueble ya existente. */
export class ActualizarInmuebleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  dependencia?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  ubicacion?: string;

  @IsOptional()
  @IsIn(['propio', 'renta'])
  propiedad?: 'propio' | 'renta';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  tipo?: string;

  /** Alta/baja logica: false lo oculta del selector de "Registrar ticket" sin borrarlo. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/**
 * Captura/edicion de las coordenadas de un inmueble (su Sede ligada, §16):
 * si el inmueble aun no tiene sede_id se crea una; si ya tiene, se
 * actualiza esa misma fila en vez de dejar sedes huerfanas sueltas.
 */
export class CapturarSedeInmuebleDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud!: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(2000)
  radio_m?: number;
}
