import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const PRIORIDADES = ['P1', 'P2', 'P3', 'P4'];

export class CrearProblemaDto {
  @IsInt()
  servicio_id!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  clave!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  descripcion!: string;

  @IsIn(PRIORIDADES, { message: 'La prioridad debe ser P1, P2, P3 o P4' })
  prioridad!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  campo_adicional?: string;

  @IsOptional()
  @IsBoolean()
  requiere_texto?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  orden?: number;
}

export class ActualizarProblemaDto {
  @IsOptional()
  @IsInt()
  servicio_id?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  clave?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  descripcion?: string;

  @IsOptional()
  @IsIn(PRIORIDADES, { message: 'La prioridad debe ser P1, P2, P3 o P4' })
  prioridad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  campo_adicional?: string;

  @IsOptional()
  @IsBoolean()
  requiere_texto?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  orden?: number;

  /** Alta/baja logica: activo=false la oculta del formulario de tickets sin borrarla. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
