import { IsString, MaxLength, MinLength } from 'class-validator';

export class MejorarObservacionesDto {
  @IsString()
  @MinLength(10, { message: 'Escribe primero una descripción antes de mejorarla' })
  @MaxLength(2000)
  texto!: string;
}
