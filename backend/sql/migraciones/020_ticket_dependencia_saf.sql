-- =====================================================================
--  Recalcula ticket.dependencia_id contra saf (no contra la columna local
--  del solicitante, que puede estar vieja de antes de que la resolucion via
--  saf existiera). Mismo criterio dual que ya usa el codigo
--  (rfcDelSolicitante/datosOrganizacionalesDelSolicitante en
--  tickets.service.ts): solicitante_id vive en el espacio de ids de saf
--  salvo que el ticket NO se haya registrado "a nombre de otro"
--  (registrado_por IS NULL) Y exista una fila local cuyo NOMBRE coincida
--  con el solicitante_nombre grabado en el ticket (asi se evita el riesgo
--  de que solicitante_id choque por casualidad con el id local de otra
--  persona). ticket.dependencia_id se queda en espacio LOCAL (se sigue
--  usando como clave de negocio real: folios OSF, escalamiento, bandeja
--  del validador), solo se corrige el VALOR via el nombre resuelto en saf.
-- =====================================================================

UPDATE ticket t
LEFT JOIN usuario ul
  ON ul.id = t.solicitante_id AND t.registrado_por IS NULL AND ul.nombre = t.solicitante_nombre
LEFT JOIN saf.s_usuario su_local ON su_local.N_Usuario = ul.rfc
LEFT JOIN saf.s_usuario su_directo ON su_directo.id_Usuario = t.solicitante_id AND ul.id IS NULL
LEFT JOIN saf.t_dependencia td_real
  ON td_real.id_Dependencia = COALESCE(su_local.id_Dependencia, su_directo.id_Dependencia)
LEFT JOIN dependencia dl_real ON dl_real.nombre = td_real.Nombre
SET t.dependencia_id = dl_real.id
WHERE dl_real.id IS NOT NULL
  AND (t.dependencia_id IS NULL OR t.dependencia_id <> dl_real.id);
