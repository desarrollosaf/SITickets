import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * Cierre de un ticket de EQUIPO DE COMPUTO (servicio CMP). Llega como
 * multipart/form-data porque puede traer fotos del equipo, asi que los
 * campos vienen como texto plano (sin @Type numerico: aqui no hace falta).
 */
export class AtenderCmpDto {
  @IsIn(['reparado', 'baja'], { message: 'El resultado debe ser reparado o baja' })
  resultado!: 'reparado' | 'baja';

  /** Obligatorios solo si se reparo el equipo. */
  @ValidateIf((o: AtenderCmpDto) => o.resultado === 'reparado')
  @IsString()
  @MinLength(3, { message: 'El diagnostico es obligatorio' })
  @MaxLength(400)
  diagnostico?: string;

  @ValidateIf((o: AtenderCmpDto) => o.resultado === 'reparado')
  @IsString()
  @MinLength(3, { message: 'La solucion es obligatoria' })
  @MaxLength(400)
  solucion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  refacciones?: string;

  /**
   * Obligatorio solo si se da de baja: es el cuerpo del "II. DICTAMEN" que el
   * sistema genera en pdf (se guarda tal cual el tecnico lo redacta; se
   * pasa a mayusculas solo al imprimirse, igual que hacia el sistema anterior).
   */
  @ValidateIf((o: AtenderCmpDto) => o.resultado === 'baja')
  @IsString()
  @MinLength(10, { message: 'Describe el dictamen de baja' })
  @MaxLength(2000)
  observaciones?: string;
}
