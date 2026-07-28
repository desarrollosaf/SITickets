-- =====================================================================
--  Login por RFC contra saf. A partir de este cambio, quien no tiene fila
--  en ticketsv2.usuario entra como solicitante identificado por
--  saf.s_usuario.id_Usuario. Ese id vive en un catalogo distinto que
--  tambien empieza en 1, asi que un choque de numeros con usuario.id es
--  cuestion de tiempo. Estas columnas guardan el nombre tal cual al
--  momento del movimiento para no depender del cruce por id al mostrarlo.
--
--  Aditivo, no toca ninguna fila existente (quedan en NULL; para esas se
--  sigue mostrando el nombre por el cruce de siempre, que para ellas es
--  correcto).
--
--  Lo aplica MigracionesService al arrancar el backend. No lleva USE:
--  corre sobre la conexion que ya apunta a DB_NAME.
--
--  Cada paso se consulta antes contra information_schema y se arma con
--  PREPARE. Sale mas verboso que un ALTER pelon, pero asi el archivo se
--  puede volver a correr sobre una base donde ya se aplico a mano (por
--  ejemplo produccion) sin tronar, y no depende de "ADD COLUMN IF NOT
--  EXISTS", que MySQL 9.x rechaza por sintaxis.
-- =====================================================================

-- 1. ticket.solicitante_nombre
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'solicitante_nombre');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN solicitante_nombre VARCHAR(120) NULL AFTER solicitante_id',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 2. ticket_bitacora.usuario_nombre
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket_bitacora'
                   AND COLUMN_NAME = 'usuario_nombre');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket_bitacora ADD COLUMN usuario_nombre VARCHAR(120) NULL AFTER usuario_id',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 3. El esquema SI tenia llaves foraneas reales en estas dos columnas (a
--    diferencia de lo que se penso al principio). Un solicitante externo
--    guarda ahi un saf.s_usuario.id_Usuario, que casi nunca existe como
--    usuario.id real, asi que el INSERT truena con "Cannot add or update a
--    child row: a foreign key constraint fails". Se quita el constraint (no
--    la columna ni sus datos); esa validacion ahora la hace el codigo (via
--    saf), no MySQL. tecnico_id y las demas FK hacia usuario NO se tocan:
--    esas siempre son personal interno real.
--
--    El nombre del constraint lo genero MySQL segun el orden en que se
--    crearon las FK, asi que cambia de servidor a servidor: se busca en
--    lugar de escribirlo.
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ticket'
               AND COLUMN_NAME = 'solicitante_id'
               AND REFERENCED_TABLE_NAME = 'usuario'
             LIMIT 1);
SET @paso := IF(@fk IS NULL, 'SELECT 1',
  CONCAT('ALTER TABLE ticket DROP FOREIGN KEY `', @fk, '`'));
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ticket_bitacora'
               AND COLUMN_NAME = 'usuario_id'
               AND REFERENCED_TABLE_NAME = 'usuario'
             LIMIT 1);
SET @paso := IF(@fk IS NULL, 'SELECT 1',
  CONCAT('ALTER TABLE ticket_bitacora DROP FOREIGN KEY `', @fk, '`'));
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
