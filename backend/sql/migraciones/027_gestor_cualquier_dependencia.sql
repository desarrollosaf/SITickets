-- =====================================================================
--  Gestor "general": puede registrar tickets a nombre de gente de
--  CUALQUIER dependencia, no solo de la suya. No es un rol aparte: es un
--  permiso extra del gestor, asi todo lo demas (Tickets generados, Mis
--  tickets, validacion previa, cambiar solicitante) sigue siendo el mismo.
--  Apagado por defecto: ningun gestor existente cambia de comportamiento.
-- =====================================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario'
                   AND COLUMN_NAME = 'registra_cualquier_dependencia');
SET @paso := IF(@existe = 0,
  'ALTER TABLE usuario ADD COLUMN registra_cualquier_dependencia TINYINT(1) NOT NULL DEFAULT 0 AFTER activo',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
