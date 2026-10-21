-- =====================================================================
--  Limpia las sedes originales (placeholder, nunca se usaron de verdad) y
--  siembra en su lugar las coordenadas reales ya capturadas a mano (via
--  /catalogo-inmuebles) para los inmuebles del catalogo (CSV de
--  migracion 029). Se liga por `dependencia`/`nombre`, no por id, para
--  que funcione sin importar los ids que haya en cada servidor.
--
--  Nadie usa las sedes viejas como destino real (nunca se completo su
--  captura real de direcciones), asi que se eliminan sin reemplazo
--  equivalente — las referencias que tuvieran (area.sede_id,
--  ticket.sede_id, ticket_sesion.sede_esperada_id) se limpian primero.
--
--  Falta por capturar: "Contraloría (Unidad Investigadora "D")".
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

UPDATE area SET sede_id = NULL WHERE sede_id IS NOT NULL;
UPDATE ticket SET sede_id = NULL WHERE sede_id IS NOT NULL;
UPDATE ticket_sesion SET sede_esperada_id = NULL WHERE sede_esperada_id IS NOT NULL;
UPDATE inmueble SET sede_id = NULL WHERE sede_id IS NOT NULL;

TRUNCATE TABLE sede;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO sede (nombre, direccion, latitud, longitud, radio_m, activo) VALUES
  ('Biblioteca Legislativa "Dr. José María Luis Mora"',
   'Pedro Ascencio número 201, Barrio de la Merced (Alameda), Toluca, Estado de México.',
   19.2910292, -99.6601929, 120, 1),
  ('Palacio del Poder Legislativo',
   'Plaza Hidalgo S/N, Colonia Centro, Toluca, Estado de México.',
   19.2925607, -99.6575958, 120, 1),
  ('Edificio San Rafael (SAF, OSFEM)',
   'Av. Independencia número 108 Poniente, Colonia Centro, Toluca, Estado de México.',
   19.2918622, -99.6552224, 120, 1),
  ('Jardín de Niños Poder legislativo',
   'Av. Miguel Hidalgo número 1069, Barrio de San Bernardino, Toluca, Estado de México.',
   19.2884461, -99.6739103, 120, 1),
  ('INESLE',
   'Av. Miguel Hidalgo número 405, Barrio de la Merced (Alameda), Toluca, Estado de México.',
   19.2900433, -99.6593963, 120, 1),
  ('Edificio (SAF, Unidad de Información, Contraloría, OSFEM)',
   'Av. Independencia número 102 Oriente, Colonia Centro, Toluca, Estado de México',
   19.2918333, -99.6540845, 120, 1),
  ('OSFEM, Matamoros',
   'Mariano Matamoros número 106, Colonia Centro, Toluca, Estado de México.',
   19.2892988, -99.6565515, 120, 1),
  ('Longares',
   'Av. Sebastián Lerdo de Tejada número 829 Poniente, Barrio de San Bernardino, Toluca, Estado de México. bm / Av. Miguel Hidalgo, número 1018 Poniente, Barrio de San Bernardino, Toluca, Estado de México. OSFEM y CV',
   19.2897254, -99.6715785, 150, 1),
  ('Archivo General del Poder Legislativo',
   'Primero de Mayo Oriente número 405, Barrio Santa Clara, Toluca, Estado de México.',
   19.2909529, -99.6494470, 100, 1),
  ('Contraloría (Unidad Investigadora "C")',
   'Av. Gustavo Baz 2160, colonia Industrial La Loma, Naucalpan de Juárez, Estado de México',
   19.5360018, -99.2070754, 120, 1),
  ('OSFEM, Lerdo',
   'Av. Sebastián Lerdo de Tejada poniente número 410, Barrio del Cóporo, Toluca, Estado de México.',
   19.2928420, -99.6588825, 120, 1),
  ('Secretaría de Asuntos Parlamentarios',
   'Av. Sebastián Lerdo de Tejada número 222, Barrio del Cóporo, Toluca, Estado de México.',
   19.2926909, -99.6597044, 120, 1),
  ('Unidad de Asistencia Social',
   'Plutarco González número 111, Barrio de la Merced (Alameda), Toluca, Estado de México.',
   19.2891935, -99.6596422, 120, 1),
  ('Dirección General de Comunicación Social',
   'Pedro Ascencio 100, colonia La Merced (Alameda), Centro Historico, Toluca, Estado de México',
   19.2898043, -99.6606957, 120, 1),
  ('OSFEM, Pino Suárez',
   'Av. Pino Suárez Sur 104,106 y 108, Colonia 5 de Mayo, Toluca, Estado de México.',
   19.2892518, -99.6506657, 120, 1),
  ('OSFEM, Quintana Roo',
   'Calle Andrés Quintana Roo 305 Norte, Colonia Sor Juana Inés de la Cruz, Toluca, Estado de México.',
   19.2924821, -99.6630070, 120, 1);

-- `inmueble` y `sede` quedaron con collations distintas (utf8mb4_0900_ai_ci
-- vs utf8mb4_unicode_ci): sin el COLLATE explicito el JOIN truena con
-- "Illegal mix of collations".
UPDATE inmueble i JOIN sede s ON s.nombre COLLATE utf8mb4_unicode_ci = i.dependencia COLLATE utf8mb4_unicode_ci
SET i.sede_id = s.id;
