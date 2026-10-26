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

  /**
   * Solo aplica cuando el campo adicional pide «Cuenta de correo»: el
   * solicitante marco «usar otro correo», asi que contexto no tiene que
   * terminar en el dominio institucional — solo se valida el formato.
   */
  @IsOptional()
  @IsBoolean()
  correo_libre?: boolean;

  /** Solo se acepta cuando la opcion del catalogo es «Otro». */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  texto?: string;

  /** Solo aplica cuando el problema es IMP-01 / IMPA-01 (solicitud de toner/cartucho). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  color_toner?: string;

  /** Solo aplica cuando el problema es IMPA-09 (traslado): que modelo se traslada. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelo_traslado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;

  /** Libre y opcional, aplica a cualquier ticket sin importar el problema. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  edificio_atencion?: string;

  /** Inmueble del catalogo elegido al registrar (ver tabla `inmueble`). Obligatorio. */
  @IsInt({ message: 'Elige el edificio o ubicación donde se atenderá' })
  @Type(() => Number)
  inmueble_id!: number;

  /** Piso u oficina dentro del inmueble elegido. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  piso?: string;

  /** Solo aplica al servicio CNA (Cartas de no adeudo): dia y hora en que el tecnico puede ir. */
  @IsOptional()
  @IsDateString({}, { message: 'La hora de atención debe venir como fecha y hora validas' })
  hora_atencion?: string;

  /** Solo lo usan admin/gestor: registra el ticket a nombre de este usuario de saf. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  a_nombre_de?: number;
}

/**
 * Correccion de los datos generales del reporte. A proposito no admite
 * problema, servicio, prioridad ni tecnico: eso es cambiar el ticket, y va por
 * reclasificar / prioridad / reasignar, que exigen motivo y otro rol.
 */
export class DatosGeneralesDto {
  /** El campo adicional del catalogo: inventario, extension afectada, cuenta… */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contexto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  edificio_atencion?: string;
}

/** Corregir a nombre de quien quedo el ticket. Sin a_nombre_de = a nombre propio. */
export class CambiarSolicitanteDto {
  /** id_Usuario de saf, igual que a_nombre_de al registrar. */
  @IsOptional()
  @IsInt()
  a_nombre_de?: number;
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

/**
 * Para poner un ticket en espera. El numero de inventario es opcional aqui
 * a proposito: solo se exige en el service cuando el motivo es "Retirar el
 * equipo..." y el ticket aun no tiene uno capturado (ver
 * TicketsService.ponerEnEspera).
 */
export class PonerEnEsperaDto extends MotivoDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  inventario?: string;
}

/**
 * Para rechazar un ticket resuelto. A diferencia de MotivoDto, el motivo es
 * opcional aqui: en servicio CNA (Cartas de no adeudo) quien cierra en lugar
 * del solicitante (ver USUARIOS_CIERRE_SERVICIO) puede rechazar con un clic,
 * sin escribir nada — para cualquier otro servicio sigue siendo obligatorio,
 * eso se valida en el service, no aqui.
 */
export class RechazarDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

export class ResolverDto {
  /** Solo para servicios normales: en CARTAS DE NO ADEUDO (CNA) se usa `revision` en su lugar. */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El diagnostico es obligatorio' })
  @MaxLength(400)
  diagnostico?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'La solucion es obligatoria' })
  @MaxLength(400)
  solucion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  refacciones?: string;

  /** Solo para CARTAS DE NO ADEUDO (CNA): revision de los bienes del solicitante. */
  @IsOptional()
  @IsIn(['completa', 'incompleta'])
  revision?: 'completa' | 'incompleta';

  /** Solo si revision = 'incompleta'. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  observaciones?: string;

  /** Solo servicio IMPA (impresoras arrendadas): tecnico externo que atendio. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tecnico_externo_id?: number;
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
