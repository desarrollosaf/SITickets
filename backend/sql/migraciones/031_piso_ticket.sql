-- =====================================================================
--  Ticket: piso/oficina por separado del inmueble, para no mezclarlo
--  en un solo texto largo (edificio_atencion ya guarda el inmueble).
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'piso');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN piso VARCHAR(60) NULL AFTER inmueble_id',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
