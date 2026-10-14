-- =====================================================================
--  Catalogo de roles administrable: el admin puede dar de alta un rol
--  nuevo (clave + nombre) desde una pantalla, sin pedir un cambio de
--  codigo. Para que un rol nuevo se pueda asignar de verdad a un usuario,
--  usuario.rol deja de ser un ENUM cerrado y pasa a VARCHAR.
--
--  Importante: esto NO da permisos al rol nuevo. Las pantallas y
--  endpoints que revisan el rol (@Roles(...) en el backend,
--  guardRol(...) en el frontend) siguen con su lista fija en codigo; un
--  rol creado aqui que no este en esa lista simplemente no ve nada.
-- =====================================================================

CREATE TABLE IF NOT EXISTS rol (
  id      SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave   VARCHAR(30) NOT NULL,
  nombre  VARCHAR(60) NOT NULL,
  activo  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_rol_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO rol (clave, nombre, activo) VALUES
  ('solicitante', 'Solicitante', TRUE),
  ('tecnico',     'Técnico', TRUE),
  ('jefe',        'Jefe de departamento', TRUE),
  ('admin',       'Administrador', TRUE),
  ('proveedor',   'Proveedor externo', TRUE),
  ('operador',    'Operador', TRUE),
  ('gestor',      'Gestor', TRUE);

-- usuario.rol: de ENUM cerrado a VARCHAR, para que un rol nuevo del
-- catalogo se pueda asignar sin que MySQL lo rechace de entrada.
SET @tipo := (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'usuario'
                AND COLUMN_NAME = 'rol');
SET @paso := IF(@tipo LIKE 'enum%',
  'ALTER TABLE usuario MODIFY COLUMN rol VARCHAR(30) NOT NULL DEFAULT ''solicitante''',
  'SELECT 1');
PREPARE ejecutar FROM @paso;
EXECUTE ejecutar;
DEALLOCATE PREPARE ejecutar;
