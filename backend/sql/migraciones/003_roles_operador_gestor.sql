-- =====================================================================
--  Dos roles nuevos: 'operador' y 'gestor'.
--
--  operador: casi como el administrador, pero acotado a registrar tickets,
--  ver todos los tickets, monitor de turnos, tablero y reasignar tecnicos.
--  No entra a catalogo/prioridades/usuarios/disponibilidad/internos ni
--  reclasifica/cambia prioridad/cancela.
--
--  gestor: registra tickets a su propio nombre o a nombre de otro usuario
--  (igual que el administrador en ese punto), y ve su propio historico de
--  tickets junto con los que registro a nombre de otros. No ve "todos los
--  tickets".
--
--  Para que el gestor pueda ver los tickets que registro a nombre de otros
--  (cuyo solicitante_id es el id de esa OTRA persona, no el suyo) se agrega
--  ticket.registrado_por: quien realmente dio de alta el ticket, cuando es
--  distinto del solicitante. Se denormaliza el nombre en
--  registrado_por_nombre por la misma razon que solicitante_nombre: evitar
--  depender del cruce por id para mostrarlo.
--
--  Mismo patron idempotente que 002_solicitante_externo.sql: cada paso se
--  checa contra information_schema antes de ejecutarse con PREPARE, para que
--  el archivo se pueda volver a correr sin tronar.
-- =====================================================================

-- 1. usuario.rol: agrega 'operador' y 'gestor' al enum.
SET @tipo := (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'usuario'
                 AND COLUMN_NAME = 'rol');
SET @paso := IF(@tipo NOT LIKE '%operador%',
  "ALTER TABLE usuario MODIFY COLUMN rol ENUM('solicitante','tecnico','jefe','admin','proveedor','operador','gestor') DEFAULT 'solicitante'",
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 2. ticket.registrado_por / registrado_por_nombre
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'registrado_por');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN registrado_por INT UNSIGNED NULL AFTER solicitante_nombre, '
  'ADD COLUMN registrado_por_nombre VARCHAR(120) NULL AFTER registrado_por',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 3. FK de registrado_por hacia usuario: a diferencia de solicitante_id,
--    registrado_por siempre es personal local (admin o gestor autenticado
--    con fila real en usuario), nunca un id de saf, asi que aqui si es
--    segura una llave foranea real.
SET @existe := (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'registrado_por'
                   AND REFERENCED_TABLE_NAME = 'usuario');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD CONSTRAINT fk_ticket_registrado_por FOREIGN KEY (registrado_por) REFERENCES usuario(id)',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
