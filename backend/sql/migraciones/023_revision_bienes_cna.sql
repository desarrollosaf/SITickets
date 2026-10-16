-- =====================================================================
--  Servicio CNA (CARTAS DE NO ADEUDO): al resolver, en vez de
--  diagnostico/solucion/refacciones, el tecnico marca una sola revision
--  por ticket: completa, o incompleta con observaciones.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'revision_bienes');
SET @paso := IF(@existe = 0,
  "ALTER TABLE ticket ADD COLUMN revision_bienes ENUM('completa','incompleta') NULL AFTER resultado_cmp",
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'observaciones_revision');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN observaciones_revision VARCHAR(400) NULL AFTER revision_bienes',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
