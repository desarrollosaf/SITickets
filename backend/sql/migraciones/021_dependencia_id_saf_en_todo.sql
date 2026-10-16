-- =====================================================================
--  ticket.dependencia_id y dependencia_validador.dependencia_id dejan de
--  ser FK al catalogo local `dependencia` (deprecado, ver 019/020) y pasan
--  a guardar directo el id de SAF (saf.t_dependencia.id_Dependencia).
--  OJO: ticket.dependencia_id SI sigue siendo clave de negocio activa
--  (folio OSF, escalamiento, bandeja del validador) — por eso, a diferencia
--  de usuario.dependencia_id, aqui tambien hay que re-anclar
--  dependencia_validador al mismo espacio de ids para que las comparaciones
--  sigan siendo validas.
-- =====================================================================

-- Tumba las FKs si todavia existen.
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket'
              AND COLUMN_NAME = 'dependencia_id' AND REFERENCED_TABLE_NAME = 'dependencia'
            LIMIT 1);
SET @paso := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE ticket DROP FOREIGN KEY ', @fk), 'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencia_validador'
              AND COLUMN_NAME = 'dependencia_id' AND REFERENCED_TABLE_NAME = 'dependencia'
            LIMIT 1);
SET @paso := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE dependencia_validador DROP FOREIGN KEY ', @fk), 'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- dependencia_validador: traduce el id local existente a su equivalente de
-- saf, emparejando por NOMBRE (ultima vez que se necesita la tabla local
-- para algo: traducir datos viejos, nunca para resolver nada nuevo).
UPDATE dependencia_validador dv
JOIN dependencia dl ON dl.id = dv.dependencia_id
JOIN __SAF_DB__.t_dependencia td ON td.Nombre = dl.nombre
SET dv.dependencia_id = td.id_Dependencia;

-- ticket.dependencia_id: mismo criterio dual que ya usa el codigo
-- (rfcDelSolicitante/datosOrganizacionalesDelSolicitante): solicitante_id
-- vive en el espacio de ids de saf salvo que el ticket NO se haya
-- registrado "a nombre de otro" (registrado_por IS NULL) Y exista una fila
-- local cuyo NOMBRE coincida con el solicitante_nombre grabado en el
-- ticket (asi se evita el riesgo de que solicitante_id choque por
-- casualidad con el id local de otra persona).
UPDATE ticket t
LEFT JOIN usuario ul
  ON ul.id = t.solicitante_id AND t.registrado_por IS NULL AND ul.nombre = t.solicitante_nombre
LEFT JOIN __SAF_DB__.s_usuario su_local ON su_local.N_Usuario = ul.rfc
LEFT JOIN __SAF_DB__.s_usuario su_directo ON su_directo.id_Usuario = t.solicitante_id AND ul.id IS NULL
SET t.dependencia_id = COALESCE(su_local.id_Dependencia, su_directo.id_Dependencia)
WHERE COALESCE(su_local.id_Dependencia, su_directo.id_Dependencia) IS NOT NULL;
