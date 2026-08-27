-- =====================================================================
--  Cedula de registro para la entrega y retiro de equipo informatico:
--  se genera automaticamente cuando el tecnico pausa un ticket de EQUIPO DE
--  COMPUTO con el motivo "Retirar el equipo del lugar para su revision".
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'cedula_retiro_url');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN cedula_retiro_url VARCHAR(255) NULL AFTER dictamen_url',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
