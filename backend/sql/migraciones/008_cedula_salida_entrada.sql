-- =====================================================================
--  Renombra cedula_retiro_url -> cedula_salida_url (el tecnico se lleva el
--  equipo) y agrega cedula_entrada_url (se lo regresa al solicitante), para
--  poder generar las dos cedulas de la misma custodia temporal.
-- =====================================================================

SET @tiene_salida := (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ticket'
                         AND COLUMN_NAME = 'cedula_salida_url');
SET @tiene_retiro := (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ticket'
                         AND COLUMN_NAME = 'cedula_retiro_url');
SET @paso := IF(@tiene_salida > 0, 'SELECT 1',
  IF(@tiene_retiro > 0,
    'ALTER TABLE ticket CHANGE COLUMN cedula_retiro_url cedula_salida_url VARCHAR(255) NULL',
    'ALTER TABLE ticket ADD COLUMN cedula_salida_url VARCHAR(255) NULL AFTER dictamen_url'));
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @tiene_entrada := (SELECT COUNT(*) FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'ticket'
                          AND COLUMN_NAME = 'cedula_entrada_url');
SET @paso2 := IF(@tiene_entrada = 0,
  'ALTER TABLE ticket ADD COLUMN cedula_entrada_url VARCHAR(255) NULL AFTER cedula_salida_url',
  'SELECT 1');
PREPARE ejecutar FROM @paso2;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
