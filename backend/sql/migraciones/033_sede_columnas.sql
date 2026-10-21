-- =====================================================================
--  Sede: nombre/direccion se ensanchan para que quepa lo que ya admite
--  Inmueble (dependencia VARCHAR(150), ubicacion VARCHAR(300)) — al
--  capturar coordenadas se copian ahi tal cual (ver
--  CatalogosService.capturarSedeInmueble) y algunas direcciones reales
--  (edificios compartidos con dos domicilios) superaban los 200 caracteres.
-- =====================================================================

SET @anchoNombre := (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sede'
                        AND COLUMN_NAME = 'nombre');
SET @pasoNombre := IF(@anchoNombre < 150,
  'ALTER TABLE sede MODIFY COLUMN nombre VARCHAR(150) NOT NULL',
  'SELECT 1');
PREPARE ejecutarNombre FROM @pasoNombre;
EXECUTE ejecutarNombre;
DEALLOCATE PREPARE ejecutarNombre;

SET @anchoDireccion := (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sede'
                           AND COLUMN_NAME = 'direccion');
SET @pasoDireccion := IF(@anchoDireccion < 300,
  'ALTER TABLE sede MODIFY COLUMN direccion VARCHAR(300) NULL',
  'SELECT 1');
PREPARE ejecutarDireccion FROM @pasoDireccion;
EXECUTE ejecutarDireccion;
DEALLOCATE PREPARE ejecutarDireccion;
