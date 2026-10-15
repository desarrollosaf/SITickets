-- =====================================================================
--  Boton "Copiar datos" (admin/operador): el aviso de que ya se copio un
--  ticket antes vivia solo en sessionStorage del navegador (se perdia al
--  cerrar la pestana). Ahora queda grabado en el ticket, para todos.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'datos_copiados');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN datos_copiados BOOLEAN NOT NULL DEFAULT FALSE AFTER motivo_rechazo_validacion',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
