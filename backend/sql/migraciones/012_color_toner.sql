-- =====================================================================
--  Cuando el problema es IMPA-01 (solicitud de toner o cartucho de una
--  impresora arrendada), ademas del modelo de impresora se necesita saber
--  que color de toner hay que cambiar. Es un dato propio, no cabe en
--  "contexto" porque ese campo ya lo ocupa el modelo de impresora.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'color_toner');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN color_toner VARCHAR(60) NULL AFTER contexto',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
