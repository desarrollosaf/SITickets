import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 13, { message: 'Captura un RFC valido' })
  rfc!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contrasena no puede pasar de 72 caracteres' })
  password!: string;
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
