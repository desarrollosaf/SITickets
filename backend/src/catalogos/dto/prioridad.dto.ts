import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * P1-P4 son fijas (son la clave primaria y las usa media logica del
 * sistema); aqui solo se ajusta el nombre y los tiempos objetivo, nunca la
 * clave ni el orden de severidad.
 */
export class ActualizarPrioridadDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El tiempo de respuesta debe ser de al menos 1 minuto' })
  @Max(65535)
  minutos_respuesta?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El tiempo de resolucion debe ser de al menos 1 minuto' })
  @Max(65535)
  minutos_resolucion?: number;
}
