-- =====================================================================
--  Catalogo de inmuebles propios y arrendados del Congreso del Estado de
--  Mexico: para que al registrar un ticket se elija el edificio de una
--  lista en vez de escribirlo a mano (el piso/referencia sigue siendo
--  texto libre aparte, no vive aqui).
-- =====================================================================

CREATE TABLE IF NOT EXISTS inmueble (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dependencia VARCHAR(150) NOT NULL,
  ubicacion   VARCHAR(300) NOT NULL,
  propiedad   ENUM('propio','renta') NOT NULL,
  tipo        VARCHAR(60) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_inmueble_dependencia (dependencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO inmueble (dependencia, ubicacion, propiedad, tipo) VALUES
('Biblioteca Legislativa "Dr. José María Luis Mora"', 'Pedro Ascencio número 201, Barrio de la Merced (Alameda), Toluca, Estado de México.', 'propio', 'Oficinas'),
('Palacio del Poder Legislativo', 'Plaza Hidalgo S/N, Colonia Centro, Toluca, Estado de México.', 'propio', 'Oficinas'),
('Edificio San Rafael (SAF, OSFEM)', 'Av. Independencia número 108 Poniente, Colonia Centro, Toluca, Estado de México.', 'propio', 'Oficinas'),
('Jardín de Niños Poder legislativo', 'Av. Miguel Hidalgo número 1069, Barrio de San Bernardino, Toluca, Estado de México.', 'propio', 'Oficinas'),
('INESLE', 'Av. Miguel Hidalgo número 405, Barrio de la Merced (Alameda), Toluca, Estado de México.', 'propio', 'Oficinas'),
('Edificio (SAF, Unidad de Información, Contraloría, OSFEM)', 'Av. Independencia número 102 Oriente, Colonia Centro, Toluca, Estado de México', 'propio', 'Oficinas'),
('OSFEM, Matamoros', 'Mariano Matamoros número 106, Colonia Centro, Toluca, Estado de México.', 'propio', 'Oficinas'),
('Longares', 'Av. Sebastián Lerdo de Tejada número 829 Poniente, Barrio de San Bernardino, Toluca, Estado de México. bm / Av. Miguel Hidalgo, número 1018 Poniente, Barrio de San Bernardino, Toluca, Estado de México. OSFEM y CV', 'propio', 'Oficinas/bodega'),
('Archivo General del Poder Legislativo', 'Primero de Mayo Oriente número 405, Barrio Santa Clara, Toluca, Estado de México.', 'renta', 'Bodega'),
('Contraloría (Unidad Investigadora "C")', 'Av. Gustavo Baz 2160, colonia Industrial La Loma, Naucalpan de Juárez, Estado de México', 'renta', 'Oficinas'),
('Contraloría (Unidad Investigadora "D")', 'Morelos número 1, 3° Piso, Colonia Centro, Chalco, Estado de México.', 'renta', 'Oficinas'),
('OSFEM, Lerdo', 'Av. Sebastián Lerdo de Tejada poniente número 410, Barrio del Cóporo, Toluca, Estado de México.', 'renta', 'Oficinas'),
('Secretaría de Asuntos Parlamentarios', 'Av. Sebastián Lerdo de Tejada número 222, Barrio del Cóporo, Toluca, Estado de México.', 'renta', 'Oficinas'),
('Unidad de Asistencia Social', 'Plutarco González número 111, Barrio de la Merced (Alameda), Toluca, Estado de México.', 'renta', 'Oficinas'),
('Dirección General de Comunicación Social', 'Pedro Ascencio 100, colonia La Merced (Alameda), Centro Historico, Toluca, Estado de México', 'renta', 'Oficinas'),
('OSFEM, Pino Suárez', 'Av. Pino Suárez Sur 104,106 y 108, Colonia 5 de Mayo, Toluca, Estado de México.', 'renta', 'Oficinas'),
('OSFEM, Quintana Roo', 'Calle Andrés Quintana Roo 305 Norte, Colonia Sor Juana Inés de la Cruz, Toluca, Estado de México.', 'renta', 'Oficinas');
