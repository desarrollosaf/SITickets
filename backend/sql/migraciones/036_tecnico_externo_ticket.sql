-- =====================================================================
--  Ticket: referencia al tecnico externo que lo atendio (solo IMPA, se
--  captura al resolver). Ver migracion 035 para el catalogo.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'tecnico_externo_id');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN tecnico_externo_id INT UNSIGNED NULL AFTER hora_atencion',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existeFk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
                     AND CONSTRAINT_NAME = 'fk_ticket_tecnico_externo');
SET @pasoFk := IF(@existeFk = 0,
  'ALTER TABLE ticket ADD CONSTRAINT fk_ticket_tecnico_externo FOREIGN KEY (tecnico_externo_id) REFERENCES tecnico_externo(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE ejecutarFk FROM @pasoFk;
EXECUTE ejecutarFk;
DEALLOCATE PREPARE ejecutarFk;
