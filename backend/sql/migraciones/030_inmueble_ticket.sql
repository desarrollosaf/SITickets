-- =====================================================================
--  Ticket: referencia al inmueble del catalogo elegido al registrar
--  (en vez de solo guardar el texto completo en edificio_atencion).
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'inmueble_id');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN inmueble_id INT UNSIGNED NULL AFTER edificio_atencion',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existeFk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                     AND CONSTRAINT_NAME = 'fk_ticket_inmueble');
SET @pasoFk := IF(@existeFk = 0,
  'ALTER TABLE ticket ADD CONSTRAINT fk_ticket_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmueble(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE ejecutarFk FROM @pasoFk;
EXECUTE ejecutarFk;
DEALLOCATE PREPARE ejecutarFk;
