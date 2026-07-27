import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  Area,
  CatalogoProblema,
  Dependencia,
  Estatus,
  MotivoReasignacion,
  Prioridad,
  Sede,
  Servicio,
  TecnicoServicio,
  Usuario,
} from '../database/models';

@Injectable()
export class CatalogosService {
  constructor(
    @InjectModel(Servicio) private readonly servicios: typeof Servicio,
    @InjectModel(CatalogoProblema) private readonly problemasM: typeof CatalogoProblema,
    @InjectModel(Prioridad) private readonly prioridades: typeof Prioridad,
    @InjectModel(Estatus) private readonly estatus: typeof Estatus,
    @InjectModel(MotivoReasignacion) private readonly motivos: typeof MotivoReasignacion,
    @InjectModel(Dependencia) private readonly dependencias: typeof Dependencia,
    @InjectModel(Area) private readonly areas: typeof Area,
    @InjectModel(Sede) private readonly sedes: typeof Sede,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
  ) {}

  async organizacion() {
    const [dependencias, areas] = await Promise.all([
      this.dependencias.findAll({
        where: { activo: true },
        attributes: ['id', 'nombre'],
        order: [['nombre', 'ASC']],
      }),
      this.areas.findAll({
        where: { activo: true },
        attributes: ['id', 'nombre', 'dependencia_id'],
        order: [['nombre', 'ASC']],
      }),
    ]);
    return { dependencias, areas };
  }

  async todo() {
    const [servicios, problemas, prioridades, estatus, motivos, sedes] = await Promise.all([
      this.servicios.findAll({
        where: { activo: true },
        order: [
          ['origen', 'ASC'],
          ['nombre', 'ASC'],
        ],
      }),
      this.problemas(),
      this.prioridades.findAll({ order: [['orden', 'ASC']] }),
      this.estatus.findAll({ order: [['orden', 'ASC']] }),
      this.motivos.findAll({ where: { activo: true }, order: [['id', 'ASC']] }),
      this.sedes.findAll({ where: { activo: true }, attributes: ['id', 'nombre', 'radio_m'] }),
    ]);
    return { servicios, problemas, prioridades, estatus, motivos, sedes };
  }

  async problemas(origen?: 'usuario' | 'administrador') {
    const filas = await this.problemasM.findAll({
      where: { activo: true },
      include: [
        {
          model: Servicio,
          as: 'servicio',
          where: { activo: true, ...(origen ? { origen } : {}) },
          required: true,
        },
      ],
      order: [
        [{ model: Servicio, as: 'servicio' }, 'nombre', 'ASC'],
        ['orden', 'ASC'],
      ],
    });

    return filas.map((p) => ({
      id: p.id,
      clave: p.clave,
      descripcion: p.descripcion,
      prioridad: p.prioridad,
      campo_adicional: p.campo_adicional,
      requiere_texto: p.requiere_texto,
      servicio_id: p.servicio_id,
      servicio: p.servicio.nombre,
      servicio_clave: p.servicio.clave,
      origen: p.servicio.origen,
    }));
  }

  /** Padron con especialidad. Nunca incluye el hash de contrasena. */
  async tecnicos() {
    const filas = await this.usuarios.findAll({
      where: { activo: true, rol: { [Op.in]: ['tecnico', 'proveedor', 'jefe'] } },
      attributes: ['id', 'nombre', 'rol'],
      include: [
        {
          model: TecnicoServicio,
          include: [{ model: Servicio, attributes: ['id', 'clave', 'nombre'] }],
        },
      ],
      order: [
        ['rol', 'ASC'],
        ['nombre', 'ASC'],
      ],
    });

    return filas.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      rol: u.rol,
      servicios: (u.especialidades ?? []).map((e) => ({
        id: e.servicio_id,
        nombre: e.servicio?.nombre ?? '—',
        suplente: e.suplente,
      })),
    }));
  }
}
