-- =====================================================================
--  IMPA-09 (traslado o reubicacion de una impresora arrendada) tenia mal
--  el campo adicional: pedia "Modelo de impresora" en vez de "Ubicacion
--  destino", al reves que su equivalente IMP-09. Un traslado necesita
--  saber a donde se mueve el equipo, no su modelo.
-- =====================================================================

UPDATE catalogo_problema
SET campo_adicional = 'Ubicación destino'
WHERE clave = 'IMPA-09' AND campo_adicional = 'Modelo de impresora';
