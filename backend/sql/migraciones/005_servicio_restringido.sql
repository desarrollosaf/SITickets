-- =====================================================================
--  Restriccion de acceso por servicio, ahora administrable en pantalla.
--
--  Reemplaza la excepcion puntual y cableada en el codigo (CAM-01 y SIS
--  solo para un puñado de rfc) por una tabla que el administrador maneja
--  desde el catalogo: activa servicio.restringido y agrega ahi a quien
--  quiera que pueda registrar tickets de ese servicio.
-- =====================================================================

-- 1. servicio.restringido
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'servicio'
                   AND COLUMN_NAME = 'restringido');
SET @paso := IF(@existe = 0,
  'ALTER TABLE servicio ADD COLUMN restringido BOOLEAN NOT NULL DEFAULT FALSE AFTER multi_tecnico',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;

-- 2. servicio_usuario_permitido
CREATE TABLE IF NOT EXISTS servicio_usuario_permitido (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  servicio_id SMALLINT UNSIGNED NOT NULL,
  rfc         VARCHAR(20) NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_servicio_rfc (servicio_id, rfc),
  CONSTRAINT fk_svc_permitido_servicio FOREIGN KEY (servicio_id) REFERENCES servicio(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Migra los dos casos que ya vivian cableados en el codigo (CAMARAS y
--    SISTEMAS), para no perder en produccion el acceso que esas personas ya
--    tenian. Se empareja por nombre, no por clave: clave/prefijo_folio no
--    son consistentes entre servicios (ej. SISTEMAS tiene clave 'SIS' pero
--    prefijo_folio 'SIS-P'), asi que nombre es el dato mas confiable para
--    identificar estos dos servicios puntuales.
--
--    Los 3 rfc ya tienen fila local en usuario (son gestor/tecnico), asi que
--    no hace falta leer saf aqui: el usuario de la app (usr_tickets2 en
--    produccion) no tiene permiso de SELECT sobre esa base.
UPDATE servicio SET restringido = TRUE WHERE nombre IN ('CAMARAS', 'SISTEMAS (PROGRESS)');

INSERT IGNORE INTO servicio_usuario_permitido (servicio_id, rfc, nombre)
SELECT s.id, x.rfc,
       COALESCE((SELECT nombre FROM usuario WHERE rfc = x.rfc LIMIT 1), x.rfc)
FROM servicio s
JOIN (
  SELECT 'CAMARAS' AS servicio_nombre, 'TOMJ820727' AS rfc
  UNION ALL SELECT 'CAMARAS', 'NATL830315'
  UNION ALL SELECT 'SISTEMAS (PROGRESS)', 'CACX680312'
) x ON x.servicio_nombre = s.nombre;
