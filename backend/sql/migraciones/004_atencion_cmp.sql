-- =====================================================================
--  Atencion de tickets de EQUIPO DE COMPUTO (CMP): en vez de "marcar
--  resuelto" a secas, el tecnico declara si reparo el equipo (mismos campos
--  de siempre: diagnostico/solucion/refacciones) o si lo dio de baja (debe
--  adjuntar un dictamen en pdf explicando el porque).
--
--  resultado_cmp guarda cual de los dos paso; dictamen_url guarda la ruta
--  relativa del pdf en disco (backend/uploads/dictamenes/...), solo cuando
--  resultado_cmp = 'baja'.
-- =====================================================================

-- 1. ticket.resultado_cmp
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'resultado_cmp');
SET @paso := IF(@existe = 0,
  "ALTER TABLE ticket ADD COLUMN resultado_cmp ENUM('reparado','baja') NULL AFTER refacciones",
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 2. ticket.dictamen_url
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'dictamen_url');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN dictamen_url VARCHAR(255) NULL AFTER resultado_cmp',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
