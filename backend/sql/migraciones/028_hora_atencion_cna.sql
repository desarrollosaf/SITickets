-- =====================================================================
--  Servicio CNA (CARTAS DE NO ADEUDO): al registrar, el solicitante (o
--  quien lo registre a nombre de otro) elige dia y hora en que el
--  tecnico puede ir a revisar los bienes — se guarda junto, como un solo
--  DATETIME.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'hora_atencion');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN hora_atencion DATETIME NULL AFTER edificio_atencion',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
