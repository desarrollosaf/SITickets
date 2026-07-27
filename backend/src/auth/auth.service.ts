import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Area, Dependencia, Usuario } from '../database/models';
import { CambiarPasswordDto, LoginDto, RegistroDto } from './dto/auth.dto';

/** Coste de bcrypt. 12 es el punto razonable hoy entre seguridad y latencia. */
const ROUNDS = 12;

export interface SesionRespuesta {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    correo: string | null;
    rol: string;
    extension: string | null;
    dependencia: string | null;
    area: string | null;
    dependencia_id: number | null;
    area_id: number | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(Area) private readonly areas: typeof Area,
    private readonly jwt: JwtService,
  ) {}

  static hash(plano: string): Promise<string> {
    return bcrypt.hash(plano, ROUNDS);
  }

  async login(dto: LoginDto): Promise<SesionRespuesta> {
    const usuario = await this.usuarios.findOne({
      where: { correo: dto.correo.trim().toLowerCase() },
      include: [Dependencia, Area],
    });

    /*
     * Se compara siempre contra un hash, exista o no la cuenta. Sin esto, el
     * tiempo de respuesta delataria que correos estan dados de alta.
     */
    const hash = usuario?.password_hash ?? '$2a$12$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalidoinv';
    const coincide = await bcrypt.compare(dto.password, hash);

    if (!usuario || !coincide || !usuario.activo) {
      throw new UnauthorizedException('Correo o contrasena incorrectos');
    }
    return this.emitir(usuario);
  }

  async registrar(dto: RegistroDto): Promise<SesionRespuesta> {
    const correo = dto.correo.trim().toLowerCase();

    if (await this.usuarios.count({ where: { correo } })) {
      throw new ConflictException('Ese correo ya tiene una cuenta');
    }

    const area = await this.areas.findByPk(dto.area_id);
    if (!area || area.dependencia_id !== dto.dependencia_id) {
      throw new BadRequestException('El area no corresponde a la dependencia elegida');
    }

    /* El rol se fija aqui, no se toma del cuerpo: nadie se registra como admin. */
    const usuario = await this.usuarios.create({
      nombre: dto.nombre.trim().toUpperCase(),
      correo,
      password_hash: await AuthService.hash(dto.password),
      dependencia_id: dto.dependencia_id,
      area_id: dto.area_id,
      extension: dto.extension?.trim() || null,
      rol: 'solicitante',
      activo: true,
    });

    await usuario.reload({ include: [Dependencia, Area] });
    return this.emitir(usuario);
  }

  async cambiarPassword(id: number, dto: CambiarPasswordDto): Promise<{ ok: true }> {
    const usuario = await this.usuarios.findByPk(id);
    if (!usuario?.password_hash) throw new UnauthorizedException('Sesion invalida');

    if (!(await bcrypt.compare(dto.actual, usuario.password_hash))) {
      throw new UnauthorizedException('La contrasena actual no coincide');
    }
    await usuario.update({ password_hash: await AuthService.hash(dto.nueva) });
    return { ok: true };
  }

  async perfil(id: number) {
    const usuario = await this.usuarios.findByPk(id, {
      attributes: { exclude: ['password_hash'] },
      include: [Dependencia, Area],
    });
    if (!usuario) throw new UnauthorizedException('Sesion invalida');
    return this.resumen(usuario);
  }

  private emitir(usuario: Usuario): SesionRespuesta {
    return {
      token: this.jwt.sign({ sub: usuario.id, rol: usuario.rol }),
      usuario: this.resumen(usuario),
    };
  }

  private resumen(usuario: Usuario) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      extension: usuario.extension,
      dependencia: usuario.dependencia?.nombre ?? null,
      area: usuario.area?.nombre ?? null,
      dependencia_id: usuario.dependencia_id,
      area_id: usuario.area_id,
    };
  }
}
