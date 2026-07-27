import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { CalendarioTecnico, Usuario } from '../database/models';
import { TrazaService } from '../tickets/traza.service';
import { CalendarioDto } from '../tickets/dto/tickets.dto';

@Injectable()
export class CalendarioService {
  constructor(
    @InjectModel(CalendarioTecnico) private readonly calendario: typeof CalendarioTecnico,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    private readonly traza: TrazaService,
  ) {}

  /**
   * §8 · bloquear o liberar un dia. Un dia bloqueado saca al tecnico de la
   * asignacion automatica, y si es el unico de su especialidad los tickets de
   * ese servicio caeran en cola: por eso el tablero muestra la cobertura.
   */
  async alternar(dto: CalendarioDto) {
    const tecnico = await this.usuarios.findOne({
      where: { id: dto.usuario, activo: true, rol: { [Op.in]: ['tecnico', 'proveedor', 'jefe'] } },
    });
    if (!tecnico) throw new BadRequestException('El tecnico no existe o no esta activo');

    if (dto.quitar) {
      await this.calendario.destroy({ where: { usuario_id: dto.usuario, fecha: dto.fecha } });
      this.traza.registra('§8', `${tecnico.nombre} disponible el ${dto.fecha}.`);
      return { bloqueado: false };
    }

    const [fila, creada] = await this.calendario.findOrCreate({
      where: { usuario_id: dto.usuario, fecha: dto.fecha },
      defaults: {
        usuario_id: dto.usuario,
        fecha: dto.fecha,
        tipo: dto.tipo ?? 'vacaciones',
        nota: dto.nota ?? null,
      },
    });
    if (!creada) {
      await fila.update({ tipo: dto.tipo ?? fila.tipo, nota: dto.nota ?? fila.nota });
    }

    this.traza.registra(
      '§8',
      `${tecnico.nombre} bloqueado el ${dto.fecha}. No recibira asignacion automatica ese dia.`,
    );
    return { bloqueado: true };
  }
}
