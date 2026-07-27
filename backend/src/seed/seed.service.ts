import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import {
  Area,
  CalendarioTecnico,
  CatalogoProblema,
  Dependencia,
  Estatus,
  MotivoReasignacion,
  Prioridad,
  ProgramaPreventivo,
  Sede,
  Servicio,
  TecnicoServicio,
  Usuario,
} from '../database/models';
import { AuthService } from '../auth/auth.service';
import {
  AREAS,
  DEPENDENCIAS,
  ESPECIALIDADES,
  ESTATUS_CATALOGO,
  MOTIVOS_REASIGNACION,
  PERSONAL,
  PRIORIDADES,
  PROBLEMAS,
  SEDES,
  SERVICIOS,
  SOLICITANTES,
} from './datos-iniciales';

const DOMINIO = 'sitickets.gob.mx';

/**
 * Convierte 'SÁNCHEZ TINOCO ERIKA GUADALUPE' en 'sanchez.tinoco'.
 * Los dos apellidos bastan para distinguir a todo el padron actual.
 */
function correoDe(nombre: string, usados: Set<string>): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/);

  const base = limpio.slice(0, 2).join('.') || 'usuario';
  let correo = `${base}@${DOMINIO}`;
  let n = 2;
  while (usados.has(correo)) correo = `${base}${n++}@${DOMINIO}`;
  usados.add(correo);
  return correo;
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly log = new Logger('Seed');

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Prioridad) private readonly prioridades: typeof Prioridad,
    @InjectModel(Estatus) private readonly estatus: typeof Estatus,
    @InjectModel(MotivoReasignacion) private readonly motivos: typeof MotivoReasignacion,
    @InjectModel(Servicio) private readonly servicios: typeof Servicio,
    @InjectModel(Dependencia) private readonly dependencias: typeof Dependencia,
    @InjectModel(Sede) private readonly sedes: typeof Sede,
    @InjectModel(Area) private readonly areas: typeof Area,
    @InjectModel(Usuario) private readonly usuarios: typeof Usuario,
    @InjectModel(TecnicoServicio) private readonly especialidades: typeof TecnicoServicio,
    @InjectModel(CatalogoProblema) private readonly problemas: typeof CatalogoProblema,
    @InjectModel(ProgramaPreventivo) private readonly preventivos: typeof ProgramaPreventivo,
    @InjectModel(CalendarioTecnico) private readonly calendario: typeof CalendarioTecnico,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('SEED_ON_BOOT') !== 'true') return;
    if (await this.servicios.count()) {
      this.log.log('La base ya tiene catalogos. No se siembra nada.');
      return;
    }
    await this.sembrar();
  }

  async sembrar() {
    const password = this.config.get<string>('SEED_PASSWORD') ?? 'Sitickets2026*';
    const hash = await AuthService.hash(password);

    await this.prioridades.bulkCreate(PRIORIDADES);
    await this.estatus.bulkCreate(ESTATUS_CATALOGO);
    await this.motivos.bulkCreate(MOTIVOS_REASIGNACION.map((nombre) => ({ nombre })));
    await this.servicios.bulkCreate(SERVICIOS);
    await this.dependencias.bulkCreate(DEPENDENCIAS.map((nombre) => ({ nombre })));
    await this.sedes.bulkCreate(SEDES.map((s) => ({ ...s, direccion: 'PENDIENTE DE CAPTURAR' })));

    const idDep = new Map((await this.dependencias.findAll()).map((d) => [d.nombre, d.id]));
    const idSede = new Map((await this.sedes.findAll()).map((s) => [s.nombre, s.id]));

    await this.areas.bulkCreate(
      AREAS.map((a) => ({
        dependencia_id: idDep.get(a.dep)!,
        nombre: a.nombre,
        sede_id: idSede.get(a.sede) ?? null,
      })),
    );
    const areas = await this.areas.findAll();
    const idArea = new Map(areas.map((a) => [`${a.dependencia_id}|${a.nombre}`, a.id]));

    const idSrv = new Map((await this.servicios.findAll()).map((s) => [s.clave, s.id]));
    await this.problemas.bulkCreate(
      PROBLEMAS.map((p) => ({
        servicio_id: idSrv.get(p.srv)!,
        clave: p.clave,
        descripcion: p.descripcion,
        prioridad: p.prioridad,
        campo_adicional: p.campo,
        requiere_texto: p.requiere_texto,
        orden: p.orden,
      })),
    );

    /* Personal del area de informatica: tecnicos, proveedor, jefe y administrador. */
    const usados = new Set<string>();
    const informatica = idDep.get('AREA DE INFORMATICA') ?? idDep.get('ÁREA DE INFORMÁTICA')!;
    const soporte = idArea.get(`${informatica}|SOPORTE TÉCNICO`) ?? null;

    await this.usuarios.bulkCreate(
      PERSONAL.map((p) => ({
        nombre: p.nombre,
        rol: p.rol,
        correo: correoDe(p.nombre, usados),
        password_hash: hash,
        dependencia_id: informatica,
        area_id: soporte,
        activo: true,
      })),
    );

    await this.usuarios.bulkCreate(
      SOLICITANTES.map((s) => {
        const dep = idDep.get(s.dep)!;
        return {
          nombre: s.nombre,
          rol: 'solicitante' as const,
          correo: correoDe(s.nombre, usados),
          password_hash: hash,
          dependencia_id: dep,
          area_id: idArea.get(`${dep}|${s.area}`) ?? null,
          extension: s.ext,
          activo: true,
        };
      }),
    );

    const idUsuario = new Map((await this.usuarios.findAll()).map((u) => [u.nombre, u.id]));

    await this.especialidades.bulkCreate(
      ESPECIALIDADES.map((e) => ({
        usuario_id: idUsuario.get(e.nombre)!,
        servicio_id: idSrv.get(e.srv)!,
        suplente: e.suplente,
      })),
    );

    /* §11 · un programa preventivo de ejemplo, a cargo del jefe de departamento. */
    const mto01 = await this.problemas.findOne({ where: { clave: 'MTO-01' } });
    const jefe = idUsuario.get('FABELA RENDON CHRISTIAN');
    if (mto01 && jefe) {
      const enUnaSemana = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      await this.preventivos.create({
        servicio_id: idSrv.get('MTO')!,
        problema_id: mto01.id,
        alcance: 'Contraloría · planta baja y primer piso (32 equipos)',
        periodicidad_dias: 180,
        proxima_fecha: enUnaSemana,
        responsable_id: jefe,
      });
    }

    /*
     * §8 · vacaciones de ejemplo. Es el unico tecnico de Sistemas, asi que su
     * especialidad queda sin cobertura y los tickets nuevos caen en cola.
     */
    const sistemas = idUsuario.get('CASTAÑEDA CABALLERO OSCAR GABRIEL');
    if (sistemas) {
      await this.calendario.create({
        usuario_id: sistemas,
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'vacaciones',
        nota: 'Periodo vacacional',
      });
    }

    const admin = await this.usuarios.findOne({ where: { rol: 'admin' } });
    this.log.log(
      `Sembrado: ${SERVICIOS.length} servicios, ${PROBLEMAS.length} problemas, ` +
        `${PERSONAL.length + SOLICITANTES.length} usuarios.`,
    );
    this.log.warn(
      `Acceso de administrador: ${admin?.correo} / ${password}. ` +
        'Cambia esta contrasena antes de exponer el sistema.',
    );
  }
}
