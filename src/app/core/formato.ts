/* =====================================================================
   Ayudas de presentacion compartidas por todas las pantallas.
   ===================================================================== */

/** 95 → «1.6 h». Lo que se lee de un vistazo, no el numero exacto. */
export function duracion(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = minutos / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

/** Cronometro hh:mm:ss para el reloj checador. */
export function cronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function fecha(valor: string | null | undefined): string {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function esFinDeSemana(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

const NOMBRE_ESTATUS: Record<string, string> = {
  REGISTRADO: 'Registrado',
  ASIGNADO: 'Asignado',
  EN_ATENCION: 'En atención',
  EN_ESPERA: 'En espera',
  RESUELTO: 'Resuelto',
  CERRADO: 'Validado / cerrado',
  CANCELADO: 'Cancelado',
};

export const NOMBRE_PRIORIDAD: Record<string, string> = {
  P1: 'Crítica',
  P2: 'Alta',
  P3: 'Media',
  P4: 'Baja',
};

/**
 * Un ticket sin tecnico se muestra como EN COLA aunque en la base siga
 * REGISTRADO: para el area lo relevante es que nadie lo esta viendo.
 */
export function etiquetaEstatus(t: {
  estatus: string;
  en_cola: boolean;
  cierre_por_omision?: boolean;
}): { texto: string; clase: string } {
  if (t.en_cola) return { texto: 'EN COLA', clase: 'estatus-EN_COLA' };
  if (t.estatus === 'CERRADO' && t.cierre_por_omision) {
    return { texto: 'Cerrado por omisión', clase: 'estatus-CERRADO' };
  }
  return {
    texto: NOMBRE_ESTATUS[t.estatus] ?? t.estatus,
    clase: `estatus-${t.estatus}`,
  };
}

/** Banderas que el area debe revisar: cada una senala un desvio del cauce normal. */
export function banderas(t: {
  reasignaciones: number;
  reclasificado: boolean;
  escalado: boolean;
  reaperturas: number;
  rechazos: number;
  interno: boolean;
  vencido: boolean;
}): { texto: string; clase: string }[] {
  const b: { texto: string; clase: string }[] = [];
  if (t.reasignaciones >= 2) b.push({ texto: `${t.reasignaciones} reasignaciones`, clase: 'chip-bandera' });
  if (t.reclasificado) b.push({ texto: 'reclasificado', clase: 'chip-bandera' });
  if (t.escalado) b.push({ texto: 'escalado auto', clase: 'chip-P1' });
  if (t.reaperturas) b.push({ texto: `reabierto ×${t.reaperturas}`, clase: 'chip-bandera' });
  if (t.rechazos) b.push({ texto: `rechazado ×${t.rechazos}`, clase: 'chip-bandera' });
  if (t.interno) b.push({ texto: 'interno', clase: 'chip-P4' });
  if (t.vencido) b.push({ texto: 'fuera de tiempo', clase: 'chip-P1' });
  return b;
}

/** Lectura corta de la verificacion de ubicacion de una sesion del reloj. */
export function resumenUbicacion(s: {
  en_sitio: boolean | null;
  distancia_m: number | null;
  sede_esperada: string | null;
  motivo_sin_ubicacion: string | null;
}): { texto: string; clase: string } {
  if (s.en_sitio === true)
    return { texto: `en sitio · ${s.distancia_m} m de ${s.sede_esperada}`, clase: 'geo-ok' };
  if (s.en_sitio === false)
    return { texto: `fuera de sitio · ${s.distancia_m} m de ${s.sede_esperada}`, clase: 'geo-no' };
  if (s.motivo_sin_ubicacion)
    return { texto: `sin ubicación · ${s.motivo_sin_ubicacion}`, clase: 'geo-sd' };
  return { texto: 'sin sede asignada para comparar', clase: 'geo-sd' };
}

/* =====================================================================
   Cuenta de correo institucional.
   Espejo de backend/src/common/correo.ts: el backend vuelve a validar, esto
   solo evita que el solicitante mande el formulario para recibir un error.
   ===================================================================== */

export const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Quita acentos/diacriticos para comparar sin importar como se hayan escrito. */
export function quitarAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Etiquetas del catalogo que piden una cuenta de correo. Se compara sin
 * acentos ni mayusculas para que un cambio de redaccion no apague la revision.
 */
export function esCampoCuentaCorreo(campo: string | null | undefined): boolean {
  if (!campo) return false;
  const limpio = quitarAcentos(campo).toLowerCase();
  return limpio.includes('cuenta de correo') || limpio.includes('correo electronico');
}

/**
 * Etiquetas del catalogo que piden un numero de inventario. Ese campo se surte
 * del sistema de bienes muebles en vez de capturarse a mano.
 */
export function esCampoInventario(campo: string | null | undefined): boolean {
  return !!campo && campo.toLowerCase().includes('inventario');
}

/** Devuelve el mensaje a mostrar, o cadena vacia si la cuenta es valida. */
export function revisaCuentaCorreo(valor: string, dominio: string): string {
  const limpio = valor.trim().toLowerCase();
  if (!limpio) return 'Captura la cuenta de correo.';
  if (!RE_CORREO.test(limpio)) {
    return `La cuenta de correo no tiene un formato válido (ejemplo: nombre.apellido@${dominio || 'dominio.gob.mx'}).`;
  }
  if (dominio && !limpio.endsWith(`@${dominio}`)) {
    return `La cuenta debe ser del dominio institucional @${dominio}.`;
  }
  return '';
}

/** Mensaje de error legible a partir de la respuesta de NestJS. */
export function mensajeError(e: unknown): string {
  const err = e as { error?: { message?: string | string[] }; status?: number };
  const m = err?.error?.message;
  if (Array.isArray(m)) return m[0];
  if (typeof m === 'string') return m;
  if (err?.status === 0) return 'No se pudo contactar al servidor.';
  return 'Ocurrió un error inesperado.';
}

/**
 * §16 · Ubicacion del navegador. Nunca rechaza: si no la obtiene devuelve el
 * motivo, porque el reloj debe arrancar igual.
 */
export function ubicacionActual(): Promise<{
  lat?: number;
  lng?: number;
  exactitud?: number;
  motivo_sin_ubicacion?: string;
}> {
  return new Promise((resolver) => {
    if (!navigator.geolocation) {
      resolver({ motivo_sin_ubicacion: 'el navegador no soporta ubicación' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolver({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          exactitud: Math.round(pos.coords.accuracy || 0),
        }),
      (err) =>
        resolver({
          motivo_sin_ubicacion:
            err.code === 1
              ? 'permiso no otorgado'
              : err.code === 2
                ? 'sin señal de ubicación'
                : 'tiempo de espera agotado',
        }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
