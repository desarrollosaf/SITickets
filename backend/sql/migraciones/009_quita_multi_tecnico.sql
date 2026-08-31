-- =====================================================================
--  servicio.multi_tecnico nunca se leyo en el backend (ni siquiera el
--  flujo de tickets internos, que es el unico que asigna equipo con
--  responsable/apoyo, lo consulta) — era un campo sin efecto. Se quita.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'servicio'
                   AND COLUMN_NAME = 'multi_tecnico');
SET @paso := IF(@existe > 0,
  'ALTER TABLE servicio DROP COLUMN multi_tecnico',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
