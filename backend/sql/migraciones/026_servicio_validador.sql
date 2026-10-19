-- =====================================================================
--  A que servicio(s) puede autorizar cada validador. Igual patron que
--  tecnico_servicio (especialidad de un tecnico): sin fila aqui, el
--  validador autoriza cualquier servicio (sin restriccion) — asi quedan
--  todos los que ya existian antes de esta migracion, sin romper nada.
--
--  Siembra el caso real de OSFEM: EUHM871224 solo autoriza EQUIPO DE
--  COMPUTO (CMP); FARC890814 autoriza todo lo demas (se le marca cada
--  servicio activo menos CMP de forma explicita, para que no se traslape
--  con EUHM871224 en ese servicio).
-- =====================================================================

CREATE TABLE IF NOT EXISTS servicio_validador (
  usuario_id  INT UNSIGNED NOT NULL,
  servicio_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, servicio_id),
  CONSTRAINT fk_servval_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  CONSTRAINT fk_servval_servicio FOREIGN KEY (servicio_id) REFERENCES servicio(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO servicio_validador (usuario_id, servicio_id)
SELECT u.id, s.id
FROM usuario u
JOIN servicio s ON s.clave = 'CMP'
WHERE u.rfc = 'EUHM871224';

INSERT IGNORE INTO servicio_validador (usuario_id, servicio_id)
SELECT u.id, s.id
FROM usuario u
JOIN servicio s ON s.clave <> 'CMP' AND s.activo = TRUE
WHERE u.rfc = 'FARC890814';
