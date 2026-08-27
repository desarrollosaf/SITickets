import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

/** Edicion de un servicio ya existente. La clave no se toca (ver el servicio). */
export class ActualizarServicioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  prefijo_folio?: string;

  @IsOptional()
  @IsIn(['usuario', 'administrador'], {
    message: 'El origen debe ser usuario o administrador',
  })
  origen?: 'usuario' | 'administrador';

  @IsOptional()
  @IsBoolean()
  externo?: boolean;

  @IsOptional()
  @IsBoolean()
  multi_tecnico?: boolean;

  /** 1 = solo la gente en su lista de usuarios permitidos (mas el admin) lo registra. */
  @IsOptional()
  @IsBoolean()
  restringido?: boolean;

  /** Alta/baja logica: false lo oculta del formulario de tickets sin borrarlo. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Agrega a alguien del padron de saf a la lista de un servicio restringido. */
export class AgregarUsuarioPermitidoDto {
  @IsInt()
  id_usuario_saf!: number;
}
