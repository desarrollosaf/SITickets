-- =====================================================================
--  Tecnicos de proveedores externos (ej. IMPA: arrendadora de impresoras
--  Ricoh/Kyocera) — catalogo simple para elegir quien atendio el ticket,
--  sin darles cuenta ni acceso al sistema.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tecnico_externo (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(120) NOT NULL UNIQUE,
  activo  BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
