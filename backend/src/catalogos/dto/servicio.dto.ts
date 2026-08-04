import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de un nuevo tipo de servicio (fila en la tabla servicio). Solo el administrador. */
export class CrearServicioDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  clave!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  /** Prefijo del folio, ej. NET → TK/NET/1/2026. */
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  prefijo_folio!: string;

  @IsIn(['usuario', 'administrador'], {
    message: 'El origen debe ser usuario o administrador',
  })
  origen!: 'usuario' | 'administrador';

  /** 1 = lo atiende un proveedor externo. */
  @IsOptional()
  @IsBoolean()
  externo?: boolean;

  /** 1 = admite varios tecnicos en el mismo ticket. */
  @IsOptional()
  @IsBoolean()
  multi_tecnico?: boolean;
}
