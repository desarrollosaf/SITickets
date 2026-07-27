import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/* =====================================================================
   Alta de tickets
   ===================================================================== */

export class CrearTicketDto {
  /** Clave del catalogo, p. ej. CMP-01. La prioridad sale de aqui, no del usuario. */
  @IsString()
  @MaxLength(20)
  problema!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contexto?: string;

  /** Solo se acepta cuando la opcion del catalogo es «Otro». */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  texto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;
}

export class CrearInternoDto {
  @IsString()
  @MaxLength(20)
  problema!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  alcance?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha planeada debe venir como AAAA-MM-DD' })
  fecha_plan?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'Selecciona al menos un tecnico' })
  @IsInt({ each: true })
  @Type(() => Number)
  tecnicos!: number[];
}

/* =====================================================================
   Movimientos del ciclo de vida
   ===================================================================== */

export class MotivoDto {
  @IsString()
  @MinLength(3, { message: 'El motivo es obligatorio' })
  @MaxLength(200)
  motivo!: string;
}

export class ResolverDto {
  @IsString()
  @MinLength(3, { message: 'El diagnostico es obligatorio' })
  @MaxLength(400)
  diagnostico!: string;

  @IsString()
  @MinLength(3, { message: 'La solucion es obligatoria' })
  @MaxLength(400)
  solucion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  refacciones?: string;
}

export class ReasignarDto {
  @IsInt({ message: 'Elige el tecnico destino' })
  @Type(() => Number)
  tecnico!: number;

  @IsString()
  @MinLength(3, { message: 'El motivo de reasignacion es obligatorio' })
  @MaxLength(60)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  nota?: string;
}

export class ReclasificarDto {
  @IsString()
  @MaxLength(20)
  problema!: string;

  @IsString()
  @MinLength(3, { message: 'El motivo de reclasificacion es obligatorio' })
  @MaxLength(200)
  motivo!: string;
}

export class PrioridadDto {
  @IsIn(['P1', 'P2', 'P3', 'P4'], { message: 'Prioridad invalida' })
  prioridad!: string;

  @IsString()
  @MinLength(3, { message: 'El motivo del cambio de prioridad es obligatorio' })
  @MaxLength(200)
  motivo!: string;
}

/* =====================================================================
   §16 · reloj checador
   La ubicacion es siempre opcional: sin coordenada el reloj arranca igual.
   ===================================================================== */

export class UbicacionDto {
  @IsOptional()
  @IsLatitude({ message: 'Latitud fuera de rango' })
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsLongitude({ message: 'Longitud fuera de rango' })
  @Type(() => Number)
  lng?: number;

  /** Margen de error en metros que reporta el dispositivo. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  exactitud?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  motivo_sin_ubicacion?: string;
}

export class RelojInicioDto extends UbicacionDto {}

export class RelojFinDto extends UbicacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  /** true deja el ticket EN ESPERA al detener el reloj. */
  @IsOptional()
  @IsBoolean()
  en_espera?: boolean;
}

/* =====================================================================
   Calendario (§8)
   ===================================================================== */

export class CalendarioDto {
  @IsInt()
  @Type(() => Number)
  usuario!: number;

  @IsDateString({}, { message: 'La fecha debe venir como AAAA-MM-DD' })
  fecha!: string;

  @IsOptional()
  @IsIn(['vacaciones', 'descanso', 'incapacidad', 'comision'])
  tipo?: 'vacaciones' | 'descanso' | 'incapacidad' | 'comision';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nota?: string;

  /** true libera el dia en lugar de bloquearlo. */
  @IsOptional()
  @IsBoolean()
  quitar?: boolean;
}
