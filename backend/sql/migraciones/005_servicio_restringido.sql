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

-- 3. Migra los dos casos que ya vivian cableados en el codigo (CAM-01 y SIS),
--    para no perder en produccion el acceso que esas personas ya tenian.
UPDATE servicio SET restringido = TRUE WHERE clave IN ('CAM-01', 'SIS');

INSERT IGNORE INTO servicio_usuario_permitido (servicio_id, rfc, nombre)
SELECT s.id, x.rfc,
       COALESCE(
         (SELECT nombre FROM usuario WHERE rfc = x.rfc LIMIT 1),
         (SELECT Nombre FROM saf.s_usuario WHERE N_Usuario = x.rfc LIMIT 1),
         x.rfc
       )
FROM servicio s
JOIN (
  SELECT 'CAM-01' AS clave, 'TOMJ820727' AS rfc
  UNION ALL SELECT 'CAM-01', 'NATL830315'
  UNION ALL SELECT 'SIS', 'CACX680312'
) x ON x.clave = s.clave;
