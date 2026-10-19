-- =====================================================================
--  Rol "sistemas": antes era un gestor (CACX680312) con 4 excepciones
--  cableadas en catalogos.service.ts (USUARIOS_GESTOR_TAMBIEN_TECNICO,
--  USUARIOS_FILTRO_SERVICIO_GENERADOS, etc). Se vuelve un rol real porque
--  esas excepciones generaban demasiado ruido para una sola persona.
--
--  El rol en si no otorga permisos (igual que cualquier fila de la tabla
--  `rol`, ver 015_catalogo_roles.sql) — eso lo sigue dando el tipo `Rol`
--  cerrado y las listas en codigo (ROLES_TECNICOS, ROLES_A_NOMBRE_DE).
-- =====================================================================

INSERT IGNORE INTO rol (clave, nombre, activo) VALUES
  ('sistemas', 'Sistemas', TRUE);

UPDATE usuario SET rol = 'sistemas' WHERE rfc = 'CACX680312';
