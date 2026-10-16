-- =====================================================================
--  usuario.dependencia_id dejo de ser FK al catalogo local `dependencia`
--  (esa tabla quedo deprecada: sus ids eran ficticios, sin relacion 1:1
--  real con saf — ver "ÁREA DE INFORMÁTICA", id local 9, que no existe en
--  saf.t_dependencia). De aqui en adelante la columna guarda directamente
--  el id de SAF (saf.t_dependencia.id_Dependencia, via s_usuario.id_Dependencia
--  cruzando por rfc) como dato de respaldo/historico — el codigo ya no lee
--  esta columna para resolver la dependencia de nadie, siempre la resuelve
--  en vivo contra saf.
-- =====================================================================

-- Tumba la FK si todavia existe (nombre historico: usuario_ibfk_1).
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario'
              AND COLUMN_NAME = 'dependencia_id' AND REFERENCED_TABLE_NAME = 'dependencia'
            LIMIT 1);
SET @paso := IF(@fk IS NOT NULL,
  CONCAT('ALTER TABLE usuario DROP FOREIGN KEY ', @fk),
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- Reescribe dependencia_id con el id de saf (por rfc). Sin rfc, no hay forma
-- de identificarlo en saf: queda tal cual estaba (no se toca).
UPDATE usuario u
JOIN saf.s_usuario su ON su.N_Usuario = u.rfc
SET u.dependencia_id = su.id_Dependencia
WHERE u.rfc IS NOT NULL;
