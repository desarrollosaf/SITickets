-- =====================================================================
--  Sin esto, reglas.asignar() nunca turna los tickets de SISTEMAS
--  (PROGRESS) a nadie: la asignacion automatica elige por especialidad
--  (tabla tecnico_servicio), y CACX680312 (rol "sistemas", ver
--  024_rol_sistemas.sql) nunca tuvo una fila ahi porque antes atendia
--  ese servicio por la excepcion cableada USUARIOS_GESTOR_TAMBIEN_TECNICO,
--  no por el mecanismo real de especialidad. Sin esta fila los tickets de
--  SIS quedan EN COLA sin asignar.
-- =====================================================================

INSERT IGNORE INTO tecnico_servicio (usuario_id, servicio_id, suplente)
SELECT u.id, s.id, FALSE
FROM usuario u
JOIN servicio s ON s.clave = 'SIS'
WHERE u.rfc = 'CACX680312';
