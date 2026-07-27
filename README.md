# SITickets · Mesa de ayuda de servicios de informática

Reimplementación en **Angular 22 + NestJS 11 + MySQL 8** del prototipo
`demo_sistema_tickets.html`. Conserva íntegras las reglas de la especificación
funcional v1.0 y corrige las dos carencias del prototipo: no tenía sesión ni
control de acceso, y toda la lógica vivía en el navegador.

---

## Base de datos

**El sistema no levanta ninguna base de datos: se conecta al servidor MySQL
del área.** Solo necesita una base y un usuario con permisos sobre ella.

```sql
CREATE DATABASE mesa_ayuda CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Para producción, un usuario propio en lugar de root. Necesita CREATE y ALTER
-- solo mientras DB_SYNC esté en true; después basta con los cuatro primeros.
CREATE USER 'mesa_app'@'%' IDENTIFIED BY 'la_contrasena_que_definan';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
   ON mesa_ayuda.* TO 'mesa_app'@'%';
FLUSH PRIVILEGES;
```

El sistema solo toca la base de `DB_NAME`; las demás del servidor no las abre.

Captura los datos en `backend/.env` (parte de `backend/.env.example`):

```bash
cp backend/.env.example backend/.env
```

**`DB_HOST` depende de dónde esté el servidor.** Es el error más común: dentro
de un contenedor, `localhost` es el contenedor mismo, no tu máquina.

| Dónde corre MySQL | Cómo corre el backend | `DB_HOST` |
|---|---|---|
| En tu misma máquina | Docker | `host.docker.internal` |
| En tu misma máquina | `npm run start:dev` | `localhost` |
| En un servidor de red | cualquiera | su IP o su nombre, p. ej. `10.0.0.25` |

Si el servidor es remoto, verifica además que el puerto 3306 esté abierto hacia
la máquina donde corre el backend y que el usuario tenga permiso desde ese host
(`'mesa_app'@'%'` o el host específico).

### Si la base ya existe

Con la base **vacía**, deja `DB_SYNC=true` y `SEED_ON_BOOT=true`: el backend
crea las 17 tablas y siembra catálogos y padrón al arrancar.

Si la base **ya se creó con `01_esquema_mysql.sql`**, ejecuta primero
[`backend/sql/01_preparar_base_existente.sql`](backend/sql/01_preparar_base_existente.sql).
El esquema original no contemplaba autenticación —la API PHP confiaba en el
identificador que le mandaba la pantalla— así que a la tabla `usuario` le falta
la columna de contraseña, y `sync()` no modifica tablas que ya existen. Sin ese
ajuste nadie podría iniciar sesión.

---

## Arranque

### Con Docker

```bash
docker compose up --build
```

| Servicio | Puerto | Qué es |
|---|---|---|
| frontend | 4200 | Angular en modo desarrollo |
| backend  | 3050 | API de NestJS, prefijo `/api` |

Abre <http://localhost:4200>.

### Sin Docker

```bash
cd backend && npm install && npm run start:dev
npm install && npm start         # en la raíz, para el frontend
```

Recuerda cambiar `DB_HOST` a `localhost` en `backend/.env` si corres así.

---

## Cuentas sembradas

Todas comparten la contraseña de `SEED_PASSWORD` (`Sitickets2026*` por omisión).
El correo se arma con los dos apellidos: `apellido.apellido@sitickets.gob.mx`.

| Perfil | Correo | Qué ve |
|---|---|---|
| Administrador | `hernandez.sanchez@sitickets.gob.mx` | Todos los tickets, monitor, tablero, disponibilidad, internos, catálogo |
| Jefe de departamento | `fabela.rendon@sitickets.gob.mx` | Su bandeja, tickets internos, monitor y tablero |
| Técnico (impresoras) | `juarez.samaniego@sitickets.gob.mx` | Solo sus tickets turnados y el reloj checador |
| Técnico (cómputo) | `lara.soto@sitickets.gob.mx` | Ídem |
| Proveedor externo | `proveedor.externo@sitickets.gob.mx` | Solo impresoras arrendadas |
| Solicitante | `nava.cortes@sitickets.gob.mx` | Registrar tickets y validar los suyos |

**Cambia la contraseña del administrador antes de exponer el sistema.**
Los solicitantes también pueden crear su cuenta desde la pantalla de acceso; el
rol se fija en el servidor, nadie se registra como técnico ni como administrador.

---

## Qué hace el sistema

| § | Regla | Dónde vive |
|---|---|---|
| 2 | El problema se elige de un catálogo de 66 opciones, no se escribe | `catalogos.service.ts`, pantalla *Registrar ticket* |
| 4 | La prioridad la impone el catálogo; el usuario no la elige | `tickets.service.ts` · `crear()` |
| 4 | Escalamiento a P1 si hay 3+ tickets del mismo servicio y dependencia en 60 min | `reglas.service.ts` · `revisaEscalamiento()` |
| 5 | Ciclo de vida completo, con **en espera** que pausa el reloj de resolución | `tickets.service.ts` |
| 6 | Folio inmutable con serie por prefijo y ejercicio; reclasificar no lo renumera | `reglas.service.ts` · `siguienteFolio()`, `reclasificar()` |
| 7 | Asignación automática: especialidad → disponibilidad → menos carga → rotación justa | `reglas.service.ts` · `asignar()` |
| 7.5 | Sin técnico disponible el ticket queda **en cola**, nunca se asigna a la fuerza | `asignar()` |
| 8 | Calendario de disponibilidad; un día bloqueado saca al técnico de la asignación | pantalla *Disponibilidad* |
| 9 | Toda reasignación y reclasificación exige motivo y queda en bitácora | `reglas.service.ts` · `anota()` |
| 10 | Diagnóstico y solución obligatorios; cierre por omisión a los 3 días sin validar | `cierrePorOmision()` |
| 11 | Tickets internos del área con varios técnicos y programa preventivo | `crearInterno()`, `mantenimiento.service.ts` |
| 13 | Tablero: rezago, desempeño por técnico e insumo para compras | pantalla *Tablero* |
| 16 | Reloj checador con verificación de ubicación **opcional** | `reloj.service.ts` |
| 17 | Monitor de turnos para proyectar en el área | pantalla *Monitor* |

### Sobre el reloj checador (§16)

La ubicación **se registra, no se exige**. Si el navegador no la entrega, el
reloj arranca igual y se guarda el motivo (permiso negado, sin señal, tiempo
agotado). Al comparar contra la sede se suma el margen de error que reporta el
dispositivo, para no marcar fuera de sitio a quien pudo estar dentro con una
lectura imprecisa.

Por eso la columna **En sitio** del tablero es un indicador de calidad del dato,
no de conducta: un porcentaje bajo casi siempre significa permiso no otorgado o
mala señal dentro del edificio.

> Las coordenadas de las ocho sedes son **de ejemplo**. Hay que capturar las
> reales, tomándolas de un mapa sobre la entrada de cada inmueble, y ajustar el
> radio por edificio antes de operar.

---

## Qué cambió respecto al prototipo

**Autenticación y alcance.** La API PHP confiaba en el identificador de usuario
que le mandaba la pantalla: cualquiera podía cerrar tickets ajenos. Aquí la
identidad sale del JWT y el alcance de cada consulta se deriva del rol en el
servidor (`TicketsService.alcance()`): un técnico solo alcanza lo que trae
turnado, un solicitante solo lo suyo. Los guards del frontend son comodidad de
navegación, no seguridad.

**Validación de entrada.** `ValidationPipe` con `whitelist` descarta cualquier
campo no declarado en el DTO. Mandar `{ "problema": "CMP-01", "prioridad": "P1" }`
devuelve 400: la prioridad la decide el catálogo, no el cliente.

**Contraseñas.** bcrypt con coste 12. El login compara siempre contra un hash,
exista o no la cuenta, para que el tiempo de respuesta no delate qué correos
están dados de alta.

**Lógica en el backend.** Los ocho procedimientos almacenados de MySQL se
reescribieron como servicios de NestJS, con transacciones y bloqueo pesimista
sobre la serie de folios. La base ya no necesita el `event_scheduler`: el cierre
por omisión y los preventivos los corre `@Cron` cada hora.

**Otros.** `helmet`, CORS acotado por `CORS_ORIGIN`, y límite de 5 intentos de
acceso por minuto.

---

## Estructura

```
backend/src/
  auth/           login, alta de solicitantes, estrategia JWT, guards de rol
  catalogos/      servicios, problemas, prioridades, padrón de técnicos
  tickets/        reglas.service (motor), tickets.service (ciclo de vida),
                  reloj.service (§16), traza.service
  operacion/      monitor, tablero, calendario, mantenimiento programado
  database/models 17 modelos Sequelize, espejo de 01_esquema_mysql.sql
  seed/           catálogos y padrón, transcritos del sistema original

src/app/
  core/           servicios de sesión y API, interceptor, guards, formato
  comp/           tabla de tickets y cajón de detalle con todas las acciones
  paginas/        login, registro, shell, tickets, bandeja, monitor,
                  tablero, disponibilidad, internos, catálogo
```

---

## Variables de entorno (`backend/.env`)

| Variable | Para qué |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | Conexión al servidor MySQL del área. Ver la tabla de `DB_HOST` más arriba |
| `DB_SYNC` | `true` crea las tablas que falten al arrancar. **Solo en desarrollo**; en producción va en `false` y el esquema se mueve con migraciones |
| `SEED_ON_BOOT` | `true` siembra catálogos y padrón si la base está vacía |
| `SEED_PASSWORD` | Contraseña inicial de las cuentas sembradas |
| `JWT_SECRET` | **Sustitúyelo** por un valor largo y aleatorio |
| `JWT_EXPIRES` | Vigencia de la sesión (`8h` por omisión) |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma |

---

## Pendientes antes de producción

- Capturar las coordenadas reales de las sedes y ajustar el radio por inmueble.
- Cambiar `JWT_SECRET`, `SEED_PASSWORD` y las credenciales de MySQL.
- Poner `DB_SYNC=false` y mover el esquema con migraciones.
- Definir política de respaldo y conservación de `ticket_bitacora` y
  `ticket_sesion`, que son las tablas que más crecen: con el volumen histórico,
  unos 500 tickets al mes generan varios miles de renglones de bitácora.
- El token vive en `localStorage`. Si el sistema sale a internet abierto,
  conviene moverlo a una cookie `httpOnly` con refresh token.
- La recurrencia de fallas **por equipo** requiere el número de inventario, que
  hoy solo trae una fracción de los tickets (punto 15.2 de la especificación).
