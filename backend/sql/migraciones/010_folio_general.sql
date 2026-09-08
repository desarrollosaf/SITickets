-- =====================================================================
--  Folio general (TK/DI/N/año), el mismo para cualquier servicio: se le
--  asigna a todo ticket al registrarse. El folio por servicio (TK/CMP/N,
--  TK/TEL/N...) se asigna hasta que el ticket cierra de verdad — validado
--  por el solicitante o por omision (ver ReglasService.asignaFolioDeCierre)
--  — y mientras tanto `folio` guarda el folio general.
-- =====================================================================

-- 1. ticket.folio_general
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'ticket'
                   AND COLUMN_NAME = 'folio_general');
SET @paso := IF(@existe = 0,
  'ALTER TABLE ticket ADD COLUMN folio_general VARCHAR(30) NULL AFTER folio',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 2. Backfill de lo ya existente: esos tickets ya tienen su folio de
--    servicio asignado desde siempre (nacieron asi), asi que su folio
--    general, para efectos practicos, es el mismo folio. De aqui en
--    adelante folio_general (TK/DI/N) y folio pueden diferir.
UPDATE ticket SET folio_general = folio WHERE folio_general IS NULL;

-- 3. Con todo poblado, ya se puede exigir NOT NULL + UNIQUE.
SET @tiene_indice := (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ticket'
                         AND INDEX_NAME = 'folio_general');
SET @paso2 := IF(@tiene_indice = 0,
  'ALTER TABLE ticket MODIFY COLUMN folio_general VARCHAR(30) NOT NULL, ADD UNIQUE KEY folio_general (folio_general)',
  'SELECT 1');
PREPARE ejecutar FROM @paso2;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
