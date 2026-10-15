-- =====================================================================
--  Campo libre y opcional en todo ticket: edificio o ubicacion donde se
--  atendera el reporte (no condicional al problema, a diferencia de
--  contexto/color_toner/modelo_traslado).
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'edificio_atencion');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN edificio_atencion VARCHAR(160) NULL AFTER extension',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
