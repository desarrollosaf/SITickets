/* =====================================================================
   Datos de arranque. Transcritos de 02_catalogos_mysql.sql y del catalogo
   Catalogo_reportes_mesa_de_ayuda.xlsx del sistema original.

   Las coordenadas de las sedes son DE EJEMPLO: hay que capturar las reales,
   tomandolas de un mapa sobre la entrada de cada inmueble, antes de operar.
   ===================================================================== */

export const PRIORIDADES = [
  { clave: 'P1', nombre: 'Critica', orden: 1, minutos_respuesta: 30, minutos_resolucion: 240 },
  { clave: 'P2', nombre: 'Alta', orden: 2, minutos_respuesta: 120, minutos_resolucion: 480 },
  { clave: 'P3', nombre: 'Media', orden: 3, minutos_respuesta: 480, minutos_resolucion: 1440 },
  { clave: 'P4', nombre: 'Baja', orden: 4, minutos_respuesta: 960, minutos_resolucion: 2400 },
];

export const ESTATUS_CATALOGO = [
  { clave: 'REGISTRADO', nombre: 'Registrado', orden: 1, final: false },
  { clave: 'ASIGNADO', nombre: 'Asignado', orden: 2, final: false },
  { clave: 'EN_ATENCION', nombre: 'En atencion', orden: 3, final: false },
  { clave: 'EN_ESPERA', nombre: 'En espera', orden: 4, final: false },
  { clave: 'RESUELTO', nombre: 'Resuelto', orden: 5, final: false },
  { clave: 'CERRADO', nombre: 'Validado / cerrado', orden: 6, final: true },
  { clave: 'CANCELADO', nombre: 'Cancelado', orden: 7, final: true },
];

export const MOTIVOS_REASIGNACION = [
  'Reclasificacion de servicio',
  'Tecnico no disponible',
  'Carga de trabajo',
  'Requiere especialidad distinta',
  'A peticion del usuario',
  'Otro',
];

export const SERVICIOS = [
  {
    clave: "CMP",
    nombre: "EQUIPO DE CÓMPUTO",
    prefijo_folio: "CMP",
    origen: "usuario",
    externo: false,
  },
  {
    clave: "IMP",
    nombre: "IMPRESORAS PROPIAS",
    prefijo_folio: "IMP",
    origen: "usuario",
    externo: false,
  },
  {
    clave: "IMPA",
    nombre: "IMPRESORAS ARRENDADAS",
    prefijo_folio: "IMPA",
    origen: "usuario",
    externo: true,
  },
  {
    clave: "TEL",
    nombre: "TELEFONÍA",
    prefijo_folio: "TEL",
    origen: "usuario",
    externo: false,
  },
  {
    clave: "NET",
    nombre: "INTERNET",
    prefijo_folio: "NET",
    origen: "usuario",
    externo: false,
  },
  {
    clave: "SIS",
    nombre: "SISTEMAS (PROGRESS)",
    prefijo_folio: "SIS-P",
    origen: "usuario",
    externo: false,
  },
  {
    clave: "COR",
    nombre: "CORREO INSTITUCIONAL",
    prefijo_folio: "COR",
    origen: "usuario",
    externo: false,
  },
  {
    clave: "CAB",
    nombre: "CABLEADO",
    prefijo_folio: "CAB",
    origen: "administrador",
    externo: false,
  },
  {
    clave: "INV",
    nombre: "LEVANTAMIENTO DE INVENTARIOS",
    prefijo_folio: "INV",
    origen: "administrador",
    externo: false,
  },
  {
    clave: "MTO",
    nombre: "MANTENIMIENTO PREVENTIVO",
    prefijo_folio: "MTO",
    origen: "administrador",
    externo: false,
  },
  {
    clave: "CFG",
    nombre: "CONFIGURACIÓN DE EQUIPOS",
    prefijo_folio: "CFG",
    origen: "administrador",
    externo: false,
  }
];

export const DEPENDENCIAS = [
  "ÓRGANO SUPERIOR DE FISCALIZACIÓN",
  "SECRETARÍA DE ADMINISTRACIÓN Y FINANZAS",
  "CONTRALORÍA",
  "LEGISLATURA",
  "SECRETARÍA DE ASUNTOS PARLAMENTARIOS",
  "DIRECCIÓN GENERAL DE COMUNICACIÓN SOCIAL",
  "UNIDAD DE INFORMACIÓN",
  "INSTITUTO DE ESTUDIOS LEGISLATIVOS",
  "ÁREA DE INFORMÁTICA"
];

export const SEDES = [
  {
    nombre: "PALACIO LEGISLATIVO",
    latitud: 19.2925,
    longitud: -99.657,
    radio_m: 150
  },
  {
    nombre: "OSFEM MATAMOROS",
    latitud: 19.2905,
    longitud: -99.6555,
    radio_m: 120
  },
  {
    nombre: "OSFEM QUINTANA ROO",
    latitud: 19.289,
    longitud: -99.66,
    radio_m: 120
  },
  {
    nombre: "OSFEM LERDO",
    latitud: 19.2935,
    longitud: -99.6535,
    radio_m: 120
  },
  {
    nombre: "OSFEM SAN RAFAEL",
    latitud: 19.286,
    longitud: -99.652,
    radio_m: 120
  },
  {
    nombre: "EDIFICIO SANTANDER",
    latitud: 19.2912,
    longitud: -99.6588,
    radio_m: 100
  },
  {
    nombre: "EDIFICIO PINO SUÁREZ",
    latitud: 19.2948,
    longitud: -99.6562,
    radio_m: 100
  },
  {
    nombre: "CONTRALORÍA",
    latitud: 19.2898,
    longitud: -99.6541,
    radio_m: 120
  }
];

export const AREAS = [
  {
    dep: "ÓRGANO SUPERIOR DE FISCALIZACIÓN",
    nombre: "DIR DE AUDITORÍA DE CUMPLIMIENTO FINANCIERO",
    sede: "OSFEM QUINTANA ROO"
  },
  {
    dep: "ÓRGANO SUPERIOR DE FISCALIZACIÓN",
    nombre: "DIR DE AUDITORÍA DE INVERSIÓN FÍSICA",
    sede: "OSFEM QUINTANA ROO"
  },
  {
    dep: "SECRETARÍA DE ADMINISTRACIÓN Y FINANZAS",
    nombre: "DEPTO DE NÓMINAS",
    sede: "PALACIO LEGISLATIVO"
  },
  {
    dep: "SECRETARÍA DE ADMINISTRACIÓN Y FINANZAS",
    nombre: "DEPTO DE ADMINISTRACIÓN DE PERSONAL",
    sede: "PALACIO LEGISLATIVO"
  },
  {
    dep: "CONTRALORÍA",
    nombre: "DIR DE SITUACIÓN PATRIMONIAL",
    sede: "CONTRALORÍA"
  },
  {
    dep: "CONTRALORÍA",
    nombre: "DEPTO DE SUBSTANCIACIÓN C",
    sede: "CONTRALORÍA"
  },
  {
    dep: "LEGISLATURA",
    nombre: "COORDINACIÓN DE GRUPO PARLAMENTARIO",
    sede: "PALACIO LEGISLATIVO"
  },
  {
    dep: "SECRETARÍA DE ASUNTOS PARLAMENTARIOS",
    nombre: "DEPTO DE PROCESO LEGISLATIVO",
    sede: "PALACIO LEGISLATIVO"
  },
  {
    dep: "DIRECCIÓN GENERAL DE COMUNICACIÓN SOCIAL",
    nombre: "DEPTO DE DIFUSIÓN",
    sede: "EDIFICIO SANTANDER"
  },
  {
    dep: "ÁREA DE INFORMÁTICA",
    nombre: "SOPORTE TÉCNICO",
    sede: "PALACIO LEGISLATIVO"
  }
];

/** Padron del area de informatica. La especialidad sale del historico 2023-2026. */
export const PERSONAL = [
  {
    nombre: "CASTAÑEDA CABALLERO OSCAR GABRIEL",
    rol: "tecnico"
  },
  {
    nombre: "JUÁREZ SAMANIEGO PASCUAL JESÚS",
    rol: "tecnico"
  },
  {
    nombre: "KURI SALGADO ESTEFANÍA",
    rol: "tecnico"
  },
  {
    nombre: "SÁNCHEZ TINOCO ERIKA GUADALUPE",
    rol: "tecnico"
  },
  {
    nombre: "LARA SOTO RICARDO",
    rol: "tecnico"
  },
  {
    nombre: "BUSTAMANTE ESQUIVEL MOISÉS",
    rol: "tecnico"
  },
  {
    nombre: "SÁNCHEZ ROSALES EDIVALDO",
    rol: "tecnico"
  },
  {
    nombre: "BARRIOS DOMÍNGUEZ GABRIEL ALBERTO",
    rol: "tecnico"
  },
  {
    nombre: "VILLA HERNÁNDEZ HUGO CESAR",
    rol: "tecnico"
  },
  {
    nombre: "DIAZ MORENO SAMUEL ALBERTO",
    rol: "tecnico"
  },
  {
    nombre: "REYES MEJÍA PABLO",
    rol: "tecnico"
  },
  {
    nombre: "ADÁN JARDÓN JOSÉ GERMAN",
    rol: "tecnico"
  },
  {
    nombre: "REYES SILVA EDUARDO YAIR",
    rol: "tecnico"
  },
  {
    nombre: "TORRES SÁNCHEZ MARIO ENRIQUE",
    rol: "tecnico"
  },
  {
    nombre: "REYES MENDIETA YAZMIN JINELY",
    rol: "tecnico"
  },
  {
    nombre: "PROVEEDOR EXTERNO (ARRENDAMIENTO)",
    rol: "proveedor"
  },
  {
    nombre: "FABELA RENDON CHRISTIAN",
    rol: "jefe"
  },
  {
    nombre: "HERNÁNDEZ SÁNCHEZ VÍCTOR ALBERTO",
    rol: "admin"
  }
];

export const ESPECIALIDADES = [
  {
    nombre: "CASTAÑEDA CABALLERO OSCAR GABRIEL",
    srv: "SIS",
    suplente: false
  },
  {
    nombre: "JUÁREZ SAMANIEGO PASCUAL JESÚS",
    srv: "IMP",
    suplente: false
  },
  {
    nombre: "KURI SALGADO ESTEFANÍA",
    srv: "TEL",
    suplente: false
  },
  {
    nombre: "SÁNCHEZ TINOCO ERIKA GUADALUPE",
    srv: "TEL",
    suplente: false
  },
  {
    nombre: "LARA SOTO RICARDO",
    srv: "CMP",
    suplente: false
  },
  {
    nombre: "BUSTAMANTE ESQUIVEL MOISÉS",
    srv: "CMP",
    suplente: false
  },
  {
    nombre: "SÁNCHEZ ROSALES EDIVALDO",
    srv: "CMP",
    suplente: false
  },
  {
    nombre: "BARRIOS DOMÍNGUEZ GABRIEL ALBERTO",
    srv: "CMP",
    suplente: false
  },
  {
    nombre: "VILLA HERNÁNDEZ HUGO CESAR",
    srv: "CMP",
    suplente: false
  },
  {
    nombre: "DIAZ MORENO SAMUEL ALBERTO",
    srv: "CMP",
    suplente: false
  },
  {
    nombre: "REYES MEJÍA PABLO",
    srv: "NET",
    suplente: false
  },
  {
    nombre: "ADÁN JARDÓN JOSÉ GERMAN",
    srv: "NET",
    suplente: false
  },
  {
    nombre: "REYES SILVA EDUARDO YAIR",
    srv: "NET",
    suplente: false
  },
  {
    nombre: "TORRES SÁNCHEZ MARIO ENRIQUE",
    srv: "NET",
    suplente: false
  },
  {
    nombre: "REYES MENDIETA YAZMIN JINELY",
    srv: "COR",
    suplente: false
  },
  {
    nombre: "PROVEEDOR EXTERNO (ARRENDAMIENTO)",
    srv: "IMPA",
    suplente: false
  }
];

/** Solicitantes de ejemplo (ficticios). */
export const SOLICITANTES = [
  {
    nombre: "ÁVILA MONROY PATRICIA",
    dep: "ÓRGANO SUPERIOR DE FISCALIZACIÓN",
    area: "DIR DE AUDITORÍA DE CUMPLIMIENTO FINANCIERO",
    ext: "7411"
  },
  {
    nombre: "NAVA CORTÉS RAÚL",
    dep: "SECRETARÍA DE ADMINISTRACIÓN Y FINANZAS",
    area: "DEPTO DE NÓMINAS",
    ext: "5181"
  },
  {
    nombre: "GUERRERO PINEDA MARISOL",
    dep: "CONTRALORÍA",
    area: "DIR DE SITUACIÓN PATRIMONIAL",
    ext: "6320"
  },
  {
    nombre: "ESTRADA LOZANO ALEJANDRO",
    dep: "LEGISLATURA",
    area: "COORDINACIÓN DE GRUPO PARLAMENTARIO",
    ext: "4202"
  },
  {
    nombre: "ROMERO BAUTISTA CLAUDIA",
    dep: "SECRETARÍA DE ASUNTOS PARLAMENTARIOS",
    area: "DEPTO DE PROCESO LEGISLATIVO",
    ext: "7042"
  },
  {
    nombre: "MEDINA SALAS JORGE",
    dep: "DIRECCIÓN GENERAL DE COMUNICACIÓN SOCIAL",
    area: "DEPTO DE DIFUSIÓN",
    ext: "5560"
  },
  {
    nombre: "VARGAS CAMPOS LILIANA",
    dep: "ÓRGANO SUPERIOR DE FISCALIZACIÓN",
    area: "DIR DE AUDITORÍA DE INVERSIÓN FÍSICA",
    ext: "7431"
  },
  {
    nombre: "PONCE REYES DIEGO",
    dep: "CONTRALORÍA",
    area: "DEPTO DE SUBSTANCIACIÓN C",
    ext: "6355"
  }
];

/** §2 · catalogo de problemas: sustituye al campo de texto libre. */
export const PROBLEMAS = [
  {
    srv: "IMP",
    clave: "IMP-01",
    descripcion: "Solicitud de tóner o cartucho",
    prioridad: "P4",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "IMP",
    clave: "IMP-02",
    descripcion: "Impresión con manchas, líneas o baja calidad",
    prioridad: "P3",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "IMP",
    clave: "IMP-03",
    descripcion: "Atasca el papel o sale arrugado",
    prioridad: "P3",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "IMP",
    clave: "IMP-04",
    descripcion: "No enciende o está fuera de servicio",
    prioridad: "P2",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 40
  },
  {
    srv: "IMP",
    clave: "IMP-05",
    descripcion: "No imprime desde mi equipo / no aparece la impresora",
    prioridad: "P2",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 50
  },
  {
    srv: "IMP",
    clave: "IMP-06",
    descripcion: "Instalación o configuración de impresora",
    prioridad: "P3",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 60
  },
  {
    srv: "IMP",
    clave: "IMP-07",
    descripcion: "Falla en escaneo o envío a correo",
    prioridad: "P3",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 70
  },
  {
    srv: "IMP",
    clave: "IMP-08",
    descripcion: "Falla al fotocopiar",
    prioridad: "P3",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 80
  },
  {
    srv: "IMP",
    clave: "IMP-09",
    descripcion: "Traslado o reubicación de impresora",
    prioridad: "P4",
    campo: "Ubicación destino",
    requiere_texto: false,
    orden: 90
  },
  {
    srv: "IMP",
    clave: "IMP-10",
    descripcion: "Mantenimiento o revisión general",
    prioridad: "P3",
    campo: "Modelo de impresora",
    requiere_texto: false,
    orden: 100
  },
  {
    srv: "IMP",
    clave: "IMP-OTRO",
    descripcion: "Otro (no aparece en la lista)",
    prioridad: "P3",
    campo: null,
    requiere_texto: true,
    orden: 110
  },
  {
    srv: "CMP",
    clave: "CMP-01",
    descripcion: "El equipo no enciende",
    prioridad: "P2",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "CMP",
    clave: "CMP-02",
    descripcion: "El equipo está lento, se traba o se reinicia",
    prioridad: "P3",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "CMP",
    clave: "CMP-03",
    descripcion: "Falla de teclado o mouse",
    prioridad: "P3",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "CMP",
    clave: "CMP-04",
    descripcion: "Falla de monitor o pantalla",
    prioridad: "P2",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 40
  },
  {
    srv: "CMP",
    clave: "CMP-05",
    descripcion: "Falla de no-break o regulador",
    prioridad: "P3",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 50
  },
  {
    srv: "CMP",
    clave: "CMP-06",
    descripcion: "Instalación o actualización de software",
    prioridad: "P4",
    campo: "Nombre del programa",
    requiere_texto: false,
    orden: 60
  },
  {
    srv: "CMP",
    clave: "CMP-07",
    descripcion: "Respaldo o formateo de información",
    prioridad: "P3",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 70
  },
  {
    srv: "CMP",
    clave: "CMP-08",
    descripcion: "Instalación o conexión de equipo nuevo",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 80
  },
  {
    srv: "CMP",
    clave: "CMP-09",
    descripcion: "Traslado o reubicación de equipo",
    prioridad: "P4",
    campo: "Ubicación destino",
    requiere_texto: false,
    orden: 90
  },
  {
    srv: "CMP",
    clave: "CMP-10",
    descripcion: "Ampliación de memoria o disco duro",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 100
  },
  {
    srv: "CMP",
    clave: "CMP-11",
    descripcion: "Dictamen técnico o baja de equipo",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 110
  },
  {
    srv: "CMP",
    clave: "CMP-12",
    descripcion: "No puedo acceder a mi sesión o a carpetas compartidas",
    prioridad: "P2",
    campo: "Usuario o carpeta",
    requiere_texto: false,
    orden: 120
  },
  {
    srv: "CMP",
    clave: "CMP-13",
    descripcion: "Revisión general del equipo",
    prioridad: "P3",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 130
  },
  {
    srv: "CMP",
    clave: "CMP-OTRO",
    descripcion: "Otro (no aparece en la lista)",
    prioridad: "P3",
    campo: null,
    requiere_texto: true,
    orden: 140
  },
  {
    srv: "TEL",
    clave: "TEL-01",
    descripcion: "La extensión no tiene línea",
    prioridad: "P2",
    campo: "Extensión afectada",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "TEL",
    clave: "TEL-02",
    descripcion: "No entran o no salen llamadas",
    prioridad: "P2",
    campo: "Extensión afectada",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "TEL",
    clave: "TEL-03",
    descripcion: "No se escucha bien / ruido en la línea",
    prioridad: "P3",
    campo: "Extensión afectada",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "TEL",
    clave: "TEL-04",
    descripcion: "El aparato telefónico está dañado",
    prioridad: "P2",
    campo: "Extensión afectada",
    requiere_texto: false,
    orden: 40
  },
  {
    srv: "TEL",
    clave: "TEL-05",
    descripcion: "Alta, cambio o reubicación de extensión",
    prioridad: "P4",
    campo: "Extensión y ubicación",
    requiere_texto: false,
    orden: 50
  },
  {
    srv: "TEL",
    clave: "TEL-06",
    descripcion: "Configuración de extensión (desvío, buzón, identificador)",
    prioridad: "P3",
    campo: "Extensión afectada",
    requiere_texto: false,
    orden: 60
  },
  {
    srv: "TEL",
    clave: "TEL-07",
    descripcion: "Revisión o reparación de extensión",
    prioridad: "P3",
    campo: "Extensión afectada",
    requiere_texto: false,
    orden: 70
  },
  {
    srv: "TEL",
    clave: "TEL-OTRO",
    descripcion: "Otro (no aparece en la lista)",
    prioridad: "P3",
    campo: null,
    requiere_texto: true,
    orden: 80
  },
  {
    srv: "NET",
    clave: "NET-01",
    descripcion: "No hay servicio de internet",
    prioridad: "P1",
    campo: "¿Cuántos equipos afecta?",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "NET",
    clave: "NET-02",
    descripcion: "Internet lento o intermitente",
    prioridad: "P3",
    campo: "¿Cuántos equipos afecta?",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "NET",
    clave: "NET-03",
    descripcion: "Conectar equipo a la red / instalar nodo",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "NET",
    clave: "NET-04",
    descripcion: "Problema de red inalámbrica (WiFi)",
    prioridad: "P3",
    campo: null,
    requiere_texto: false,
    orden: 40
  },
  {
    srv: "NET",
    clave: "NET-05",
    descripcion: "Falla de módem, switch o antena",
    prioridad: "P1",
    campo: null,
    requiere_texto: false,
    orden: 50
  },
  {
    srv: "NET",
    clave: "NET-06",
    descripcion: "No puedo acceder a un sistema o página",
    prioridad: "P2",
    campo: "Sistema o página",
    requiere_texto: false,
    orden: 60
  },
  {
    srv: "NET",
    clave: "NET-07",
    descripcion: "Revisión general del servicio de internet",
    prioridad: "P3",
    campo: null,
    requiere_texto: false,
    orden: 70
  },
  {
    srv: "NET",
    clave: "NET-OTRO",
    descripcion: "Otro (no aparece en la lista)",
    prioridad: "P3",
    campo: null,
    requiere_texto: true,
    orden: 80
  },
  {
    srv: "SIS",
    clave: "SIS-01",
    descripcion: "Consulta o relación de movimientos contables",
    prioridad: "P3",
    campo: "Sistema / cuenta",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "SIS",
    clave: "SIS-02",
    descripcion: "Corrección o eliminación de registros / pólizas",
    prioridad: "P3",
    campo: "Sistema / póliza",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "SIS",
    clave: "SIS-03",
    descripcion: "Cálculo o integración de nómina, ISR o timbrado",
    prioridad: "P2",
    campo: "Quincena y ejercicio",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "SIS",
    clave: "SIS-04",
    descripcion: "Alta, baja o cambio en catálogo de personal",
    prioridad: "P3",
    campo: "Sistema",
    requiere_texto: false,
    orden: 40
  },
  {
    srv: "SIS",
    clave: "SIS-05",
    descripcion: "Actualizar sistema local de consultas",
    prioridad: "P4",
    campo: null,
    requiere_texto: false,
    orden: 50
  },
  {
    srv: "SIS",
    clave: "SIS-06",
    descripcion: "Modificación o desarrollo de programa o reporte",
    prioridad: "P4",
    campo: "Sistema / programa",
    requiere_texto: false,
    orden: 60
  },
  {
    srv: "SIS",
    clave: "SIS-07",
    descripcion: "Generación o exportación de información",
    prioridad: "P3",
    campo: "Sistema",
    requiere_texto: false,
    orden: 70
  },
  {
    srv: "SIS",
    clave: "SIS-08",
    descripcion: "Falla de acceso o base de datos (usuario colgado, bloqueo)",
    prioridad: "P1",
    campo: "Sistema / base de datos",
    requiere_texto: false,
    orden: 80
  },
  {
    srv: "SIS",
    clave: "SIS-OTRO",
    descripcion: "Otro (no aparece en la lista)",
    prioridad: "P3",
    campo: null,
    requiere_texto: true,
    orden: 90
  },
  {
    srv: "COR",
    clave: "COR-01",
    descripcion: "Olvidé o venció mi contraseña de correo",
    prioridad: "P2",
    campo: "Cuenta de correo",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "COR",
    clave: "COR-02",
    descripcion: "No puedo acceder al buzón",
    prioridad: "P2",
    campo: "Cuenta de correo",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "COR",
    clave: "COR-03",
    descripcion: "Alta o baja de cuenta de correo",
    prioridad: "P4",
    campo: "Nombre del servidor público",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "COR",
    clave: "COR-04",
    descripcion: "No envía o no recibe correos",
    prioridad: "P2",
    campo: "Cuenta de correo",
    requiere_texto: false,
    orden: 40
  },
  {
    srv: "COR",
    clave: "COR-05",
    descripcion: "Configuración de correo en equipo o celular",
    prioridad: "P4",
    campo: "Cuenta de correo",
    requiere_texto: false,
    orden: 50
  },
  {
    srv: "COR",
    clave: "COR-OTRO",
    descripcion: "Otro (no aparece en la lista)",
    prioridad: "P3",
    campo: null,
    requiere_texto: true,
    orden: 60
  },
  {
    srv: "CAB",
    clave: "CAB-01",
    descripcion: "Instalación de cableado estructurado",
    prioridad: "P4",
    campo: "Ubicación",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "CAB",
    clave: "CAB-02",
    descripcion: "Reparación o reordenamiento de cableado",
    prioridad: "P4",
    campo: "Ubicación",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "INV",
    clave: "INV-01",
    descripcion: "Levantamiento de inventario por área",
    prioridad: "P4",
    campo: "Área / dependencia",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "INV",
    clave: "INV-02",
    descripcion: "Verificación física de bienes",
    prioridad: "P4",
    campo: "Área / dependencia",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "MTO",
    clave: "MTO-01",
    descripcion: "Mantenimiento preventivo de equipo de cómputo",
    prioridad: "P4",
    campo: "Área / dependencia",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "MTO",
    clave: "MTO-02",
    descripcion: "Mantenimiento preventivo de impresoras",
    prioridad: "P4",
    campo: "Área / dependencia",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "MTO",
    clave: "MTO-03",
    descripcion: "Mantenimiento preventivo de sitio / rack",
    prioridad: "P4",
    campo: "Ubicación",
    requiere_texto: false,
    orden: 30
  },
  {
    srv: "CFG",
    clave: "CFG-01",
    descripcion: "Configuración de equipo nuevo",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 10
  },
  {
    srv: "CFG",
    clave: "CFG-02",
    descripcion: "Reinstalación de sistema operativo y software base",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 20
  },
  {
    srv: "CFG",
    clave: "CFG-03",
    descripcion: "Preparación de equipo para reasignación",
    prioridad: "P4",
    campo: "No. de inventario",
    requiere_texto: false,
    orden: 30
  }
];
