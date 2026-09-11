-- =====================================================================
--  Cuando un ticket de EQUIPO DE COMPUTO se da de baja, el "II. DICTAMEN"
--  que redacta el tecnico (hasta 2000 caracteres, ver AtenderCmpDto) ahora
--  tambien se guarda en ticket.diagnostico, no solo en el pdf generado.
--  VARCHAR(400) se queda corto para ese texto -> se amplia a VARCHAR(2000).
-- =====================================================================

SET @largo := (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'ticket'
                  AND COLUMN_NAME = 'diagnostico');
SET @paso := IF(@largo < 2000,
  'ALTER TABLE ticket MODIFY COLUMN diagnostico VARCHAR(2000) NULL',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
