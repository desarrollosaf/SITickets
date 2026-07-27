import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Captura un correo valido' })
  @MaxLength(120)
  correo!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contrasena no puede pasar de 72 caracteres' })
  password!: string;
}

/**
 * Alta de solicitante. Solo este rol puede autoregistrarse: tecnicos, jefes y
 * administradores los da de alta el administrador desde el modulo de usuarios.
 */
export class RegistroDto {
  @IsString()
  @MinLength(6, { message: 'Captura tu nombre completo' })
  @MaxLength(120)
  nombre!: string;

  @IsEmail({}, { message: 'Captura un correo valido' })
  @MaxLength(120)
  correo!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(72)
  @Matches(/[A-Za-z]/, { message: 'La contrasena debe incluir al menos una letra' })
  @Matches(/[0-9]/, { message: 'La contrasena debe incluir al menos un numero' })
  password!: string;

  @IsInt({ message: 'Elige tu dependencia' })
  dependencia_id!: number;

  @IsInt({ message: 'Elige tu area' })
  area_id!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;
}

export class CambiarPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  actual!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena nueva debe tener al menos 8 caracteres' })
  @MaxLength(72)
  @Matches(/[A-Za-z]/, { message: 'La contrasena debe incluir al menos una letra' })
  @Matches(/[0-9]/, { message: 'La contrasena debe incluir al menos un numero' })
  nueva!: string;
}
