import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de un tecnico externo nuevo (proveedor, p. ej. IMPA). Solo el administrador. */
export class CrearTecnicoExternoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;
}

/** Edicion de un tecnico externo ya existente. */
export class ActualizarTecnicoExternoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  /** Alta/baja logica: false lo oculta del selector al resolver, sin borrarlo. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
