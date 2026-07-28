import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Sequelize } from 'sequelize';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aplica los .sql de backend/sql/migraciones al arrancar, una sola vez cada
 * uno, en orden alfabetico (por eso van numerados: 002_, 003_...).
 *
 * DB_SYNC no sustituye esto: sync() crea tablas que faltan, pero no agrega
 * columnas ni suelta llaves foraneas sobre una tabla que ya existe. Ese es
 * justo el tipo de cambio que vive aqui.
 *
 * Lo aplicado se anota en la tabla `migracion`. Aun asi, cada archivo se
 * escribe para poder correrse dos veces sin tronar: en el servidor que ya
 * recibio el cambio a mano la tabla de control esta vacia y el archivo se
 * intentaria de nuevo.
 */
@Injectable()
export class MigracionesService implements OnApplicationBootstrap {
  private readonly log = new Logger('Migraciones');

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('DB_MIGRAR') === 'false') {
      this.log.warn('DB_MIGRAR=false: no se aplica ninguna migracion');
      return;
    }

    const carpeta = this.carpeta();
    if (!carpeta) {
      this.log.warn('No se encontro la carpeta sql/migraciones; no hay nada que aplicar');
      return;
    }

    await this.sequelize.query(
      `CREATE TABLE IF NOT EXISTS migracion (
         archivo  VARCHAR(160) NOT NULL PRIMARY KEY,
         aplicada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );

    const previas = await this.sequelize.query<{ archivo: string }>(
      'SELECT archivo FROM migracion',
      { type: QueryTypes.SELECT },
    );
    const aplicadas = new Set(previas.map((f) => f.archivo));

    const pendientes = readdirSync(carpeta)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => !aplicadas.has(f));

    if (!pendientes.length) {
      this.log.log('Esquema al corriente');
      return;
    }

    for (const archivo of pendientes) {
      await this.aplicar(carpeta, archivo);
    }
  }

  private async aplicar(carpeta: string, archivo: string) {
    const sentencias = separar(readFileSync(join(carpeta, archivo), 'utf8'));

    /*
     * Todo el archivo va por una sola conexion: las migraciones usan
     * variables de sesion (@paso) y PREPARE, que se pierden si el pool
     * reparte las sentencias entre conexiones distintas. La transaccion se
     * usa para eso, no para poder revertir: MySQL hace commit implicito en
     * cada DDL.
     */
    const t = await this.sequelize.transaction();
    try {
      for (const sentencia of sentencias) {
        await this.sequelize.query(sentencia, { transaction: t });
      }
      await this.sequelize.query('INSERT INTO migracion (archivo) VALUES (?)', {
        replacements: [archivo],
        transaction: t,
      });
      await t.commit();
      this.log.log(`Aplicada ${archivo} (${sentencias.length} sentencias)`);
    } catch (e) {
      await t.rollback();
      /*
       * Se corta el arranque: seguir con el esquema a medias solo cambia el
       * error de sitio, y ahi ya seria en la cara del usuario.
       */
      this.log.error(`Fallo ${archivo}: ${(e as Error).message}`);
      throw e;
    }
  }

  /** La carpeta esta fuera de dist/, y el cwd cambia entre docker y npm. */
  private carpeta(): string | null {
    const candidatas = [
      join(process.cwd(), 'sql', 'migraciones'),
      join(__dirname, '..', '..', 'sql', 'migraciones'),
    ];
    return candidatas.find(existsSync) ?? null;
  }
}

/**
 * Parte el archivo en sentencias. Corta en ';' y descarta las lineas de
 * comentario; no entiende de literales con ';' adentro, cosa que estos
 * archivos no traen. Vale para SQL propio, no para volcados de terceros.
 */
function separar(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
