-- =====================================================================
--  Servicio restringido (servicio.restringido=1): hasta ahora, quien esta
--  en la lista de permitidos solo podia registrar a su propio nombre, sin
--  excepcion. Este campo nuevo permite habilitar "a nombre de otro"
--  servicio por servicio (default false: se queda igual que antes).
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'servicio'
                   AND COLUMN_NAME = 'permite_a_nombre_de');
SET @paso := IF(@existe = 0,
  'ALTER TABLE servicio ADD COLUMN permite_a_nombre_de BOOLEAN NOT NULL DEFAULT FALSE AFTER restringido',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- Se activa de una vez para "SISTEMAS (PROGRESS)" (clave SIS), a peticion
-- expresa: ahi si se puede elegir a nombre de otro.
UPDATE servicio SET permite_a_nombre_de = TRUE WHERE clave = 'SIS';
