-- =====================================================================
--  Rol "validador": cuando un gestor registra un ticket para gente de una
--  dependencia que tiene al menos un validador asignado (tabla nueva
--  dependencia_validador), el ticket queda pendiente de revision antes de
--  turnarse a tecnico o contar para el SLA/escalamiento.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dependencia_validador (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dependencia_id SMALLINT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_dependencia_validador (dependencia_id, usuario_id),
  CONSTRAINT fk_depval_dependencia FOREIGN KEY (dependencia_id) REFERENCES dependencia(id),
  CONSTRAINT fk_depval_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- f_registro: ya era DATETIME NULL por defecto de Sequelize, pero se
-- confirma aqui por si en algun ambiente quedo NOT NULL.
SET @tipo := (SELECT IS_NULLABLE FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'f_registro');
SET @paso := IF(@tipo = 'NO',
  'ALTER TABLE ticket MODIFY COLUMN f_registro DATETIME NULL',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'pendiente_validacion');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN pendiente_validacion BOOLEAN NOT NULL DEFAULT FALSE AFTER f_cancelacion',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'f_captura');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN f_captura DATETIME NULL AFTER pendiente_validacion',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'validado_por');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN validado_por INT UNSIGNED NULL AFTER f_captura',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'validado_por_nombre');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN validado_por_nombre VARCHAR(120) NULL AFTER validado_por',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket' AND COLUMN_NAME = 'motivo_rechazo_validacion');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN motivo_rechazo_validacion VARCHAR(400) NULL AFTER validado_por_nombre',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
