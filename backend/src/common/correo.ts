/**
 * Reglas de la cuenta de correo institucional.
 *
 * El dominio sale de CORREO_DOMINIO para que el area lo cambie sin recompilar,
 * y el backend lo publica en /catalogos: asi el formulario de alta valida con el
 * mismo valor y no hay dos verdades.
 */

export const DOMINIO_POR_OMISION = 'congresoedomex.gob.mx';

/**
 * Estructura de correo. Deliberadamente estricta —un solo @, sin espacios, con
 * dominio de al menos dos letras— porque el campo alimenta al tecnico que va a
 * restablecer la cuenta: un valor mal capturado le hace perder la visita.
 */
export const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Vacio significa «cualquier dominio»: el area puede relajar la regla. */
export function dominioInstitucional(valor?: string | null): string {
  return (valor ?? DOMINIO_POR_OMISION).trim().toLowerCase().replace(/^@/, '');
}

/**
 * Etiquetas del catalogo que piden una cuenta de correo. Se compara sin acentos
 * ni mayusculas para que un ajuste de redaccion no desactive la validacion en
 * silencio.
 */
export function esCampoCuentaCorreo(campo: string | null | undefined): boolean {
  if (!campo) return false;
  const limpio = campo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return limpio.includes('cuenta de correo') || limpio.includes('correo electronico');
}

/**
 * Valida y normaliza la cuenta capturada: devuelve el valor listo para guardar
 * o el mensaje que se le muestra al solicitante.
 */
export function revisaCuentaCorreo(
  valor: string | null | undefined,
  dominio: string,
): { correo: string } | { error: string } {
  const limpio = (valor ?? '').trim().toLowerCase();

  if (!limpio) return { error: 'Captura la cuenta de correo.' };
  if (!RE_CORREO.test(limpio)) {
    const ejemplo = `nombre.apellido@${dominio || 'dominio.gob.mx'}`;
    return { error: `La cuenta de correo no tiene un formato valido (ejemplo: ${ejemplo}).` };
  }
  if (dominio && !limpio.endsWith(`@${dominio}`)) {
    return { error: `La cuenta debe ser del dominio institucional @${dominio}.` };
  }
  return { correo: limpio };
}
