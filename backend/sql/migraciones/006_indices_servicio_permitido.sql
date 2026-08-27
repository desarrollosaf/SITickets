-- =====================================================================
--  Con DB_SYNC=true, sync() ya habia creado servicio_usuario_permitido a
--  partir del modelo (que en 005 no traia el indice unico ni el default de
--  creado_en) antes de que el CREATE TABLE IF NOT EXISTS de esa migracion
--  corriera, asi que quedo sin esos dos ajustes. Se agregan aqui.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'servicio_usuario_permitido'
                   AND INDEX_NAME = 'uq_servicio_rfc');
SET @paso := IF(@existe = 0,
  'ALTER TABLE servicio_usuario_permitido ADD UNIQUE KEY uq_servicio_rfc (servicio_id, rfc)',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

UPDATE servicio_usuario_permitido SET creado_en = NOW() WHERE creado_en IS NULL;

ALTER TABLE servicio_usuario_permitido
  MODIFY COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
