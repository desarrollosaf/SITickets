-- =====================================================================
--  Login por RFC contra saf. A partir de este cambio, quien no tiene fila
--  en ticketsv2.usuario entra como solicitante identificado por
--  saf.s_usuario.id_Usuario (no se crea fila local para el). Ese id vive
--  en el mismo espacio numerico que usuario.id? No: son catalogos
--  distintos que ambos empiezan en 1, asi que un choque de numeros es
--  cuestion de tiempo. Estas columnas guardan el nombre tal cual al
--  momento del movimiento para no depender del cruce por id al mostrarlo.
--
--  Aditivo, no toca ninguna fila existente (quedan en NULL; para esas se
--  sigue mostrando el nombre por el cruce de siempre, que para ellas es
--  correcto).
-- =====================================================================

USE adminplem_ticketsv2;

-- Nota: "ADD COLUMN IF NOT EXISTS" truena en MySQL 9.x con error de sintaxis
-- (si tu servidor si lo soporta, es mas seguro agregarlo de vuelta). Antes
-- de correr esto a mano, confirma que la columna no exista ya:
--
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA='ticketsv2' AND TABLE_NAME='ticket'
--      AND COLUMN_NAME='solicitante_nombre';

ALTER TABLE ticket
  ADD COLUMN solicitante_nombre VARCHAR(120) NULL AFTER solicitante_id;

ALTER TABLE ticket_bitacora
  ADD COLUMN usuario_nombre VARCHAR(120) NULL AFTER usuario_id;

-- El esquema SI tenia llaves foraneas reales en estas dos columnas (a
-- diferencia de lo que se penso al principio). Un solicitante externo
-- guarda ahi un saf.s_usuario.id_Usuario, que casi nunca existe como
-- usuario.id real, asi que el INSERT truena con
-- "Cannot add or update a child row: a foreign key constraint fails".
-- Se quita el constraint (no la columna ni sus datos); esa validacion
-- ahora la hace el codigo (via saf), no MySQL. tecnico_id y las demas
-- FK hacia usuario NO se tocan: esas siempre son personal interno real.
--
-- OJO: "ticket_ibfk_4" y "ticket_bitacora_ibfk_2" son los nombres que
-- genero MySQL en ESTA base (dependen del orden en que se crearon las FK
-- al levantar el esquema). En otro servidor (produccion) confirma el
-- nombre real antes de correr esto:
--
--   SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
--     FROM information_schema.KEY_COLUMN_USAGE
--    WHERE TABLE_SCHEMA = 'ticketsv2' AND REFERENCED_TABLE_NAME = 'usuario'
--      AND TABLE_NAME IN ('ticket','ticket_bitacora')
--      AND COLUMN_NAME IN ('solicitante_id','usuario_id');
ALTER TABLE ticket
  DROP FOREIGN KEY ticket_ibfk_4;

ALTER TABLE ticket_bitacora
  DROP FOREIGN KEY ticket_bitacora_ibfk_2;
