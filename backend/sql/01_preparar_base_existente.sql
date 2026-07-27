-- =====================================================================
--  Ajuste para bases que YA fueron creadas con 01_esquema_mysql.sql
--
--  Solo hace falta en ese caso. Si dejas que el backend cree el esquema
--  (DB_SYNC=true sobre una base vacia) no necesitas ejecutar nada de esto.
--
--  El esquema original no contemplaba autenticacion: la API PHP confiaba en
--  el identificador que le mandaba la pantalla. Este script agrega lo que el
--  inicio de sesion necesita.
-- =====================================================================

USE mesa_ayuda;

-- 1. Hash de la contrasena. Nunca sale del backend.
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(72) NULL AFTER correo;

-- 2. El correo es la credencial de acceso: tiene que ser unico.
--    Antes de crear el indice, revisa que no haya repetidos ni vacios:
--
--      SELECT correo, COUNT(*) FROM usuario
--       WHERE correo IS NOT NULL GROUP BY correo HAVING COUNT(*) > 1;
--
--    Los NULL no estorban: MySQL los permite repetidos en un indice unico.
ALTER TABLE usuario
  ADD UNIQUE KEY IF NOT EXISTS uq_usuario_correo (correo);

-- 3. Asigna correo a quien no lo tenga, con los dos apellidos.
--    Ajusta el dominio al del area antes de ejecutar.
UPDATE usuario
   SET correo = CONCAT(
         LOWER(REPLACE(
           TRIM(SUBSTRING_INDEX(CONVERT(nombre USING ascii), ' ', 2)),
           ' ', '.')),
         '@sitickets.gob.mx')
 WHERE correo IS NULL OR correo = '';

-- 4. Las contrasenas NO se ponen aqui: un hash bcrypt no se genera en SQL.
--    Deja los usuarios sin password_hash y arranca el backend una vez con
--    SEED_ON_BOOT=true; si la base ya tiene catalogos no siembra nada, asi
--    que la forma de darles acceso es una de estas dos:
--
--    a) Que cada quien cree su cuenta desde la pantalla de alta (solo aplica
--       a solicitantes; el rol lo fija el servidor).
--
--    b) Generar los hashes con el propio backend:
--         cd backend
--         node -e "console.log(require('bcryptjs').hashSync('LaQueDefinan1',12))"
--       y aplicarlo a quien corresponda:
--         UPDATE usuario SET password_hash = '<el hash>' WHERE correo = '...';
--
--    Un usuario sin password_hash simplemente no puede entrar: el login
--    compara contra un hash invalido y responde lo mismo que a una
--    contrasena equivocada.

-- 5. Verificacion
SELECT COUNT(*) AS usuarios,
       SUM(correo IS NOT NULL)        AS con_correo,
       SUM(password_hash IS NOT NULL) AS con_acceso
  FROM usuario;
