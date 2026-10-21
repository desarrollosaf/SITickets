-- =====================================================================
--  Inmueble: relacion con sede (coordenadas), para que el reloj checador
--  pueda comparar la ubicacion del tecnico contra el edificio elegido al
--  registrar el ticket (antes solo se resolvia por el area del solicitante).
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inmueble'
                   AND COLUMN_NAME = 'sede_id');
SET @paso := IF(@existe = 0,
  'ALTER TABLE inmueble ADD COLUMN sede_id SMALLINT UNSIGNED NULL AFTER activo',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @existeFk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inmueble'
                     AND CONSTRAINT_NAME = 'fk_inmueble_sede');
SET @pasoFk := IF(@existeFk = 0,
  'ALTER TABLE inmueble ADD CONSTRAINT fk_inmueble_sede FOREIGN KEY (sede_id) REFERENCES sede(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE ejecutarFk FROM @pasoFk;
EXECUTE ejecutarFk;
DEALLOCATE PREPARE ejecutarFk;
