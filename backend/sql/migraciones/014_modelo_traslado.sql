-- =====================================================================
--  IMPA-09 (traslado o reubicacion de impresora arrendada) necesita DOS
--  datos a la vez: que modelo se traslada y a donde. "contexto" ya quedo
--  ocupado por la ubicacion destino (migracion 013), asi que el modelo
--  va en un campo propio, igual que color_toner para la solicitud de
--  toner/cartucho.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'modelo_traslado');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN modelo_traslado VARCHAR(120) NULL AFTER color_toner',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
