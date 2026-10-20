/**
 * Fecha calendario (YYYY-MM-DD) en la hora local del proceso, que es la de
 * Mexico (TZ=America/Mexico_City en el contenedor).
 *
 * No usar toISOString().slice(0, 10): esa siempre es la fecha UTC, y de las
 * 18:00 en adelante ya da el dia de manana.
 */
/**
 * Fecha lista para una celda de Excel. ExcelJS escribe la hora UTC tal cual
 * y Excel no tiene zona horaria: sin este corrimiento las 12:49 de Mexico se
 * verian como 18:49.
 */
export function fechaExcel(d: Date | null | undefined): Date | null {
  if (!d) return null;
  const f = new Date(d);
  return new Date(f.getTime() - f.getTimezoneOffset() * 60_000);
}

export function fechaLocal(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Jornada laboral (hora local del proceso, ver TZ arriba): lunes a viernes, 9:00 a 18:30. */
const JORNADA_INICIO_MIN = 9 * 60;
const JORNADA_FIN_MIN = 18 * 60 + 30;

/** 9:00 am del siguiente dia habil (salta sabado y domingo). */
function inicioSiguienteDiaHabil(d: Date): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  n.setHours(9, 0, 0, 0);
  while (n.getDay() === 0 || n.getDay() === 6) n.setDate(n.getDate() + 1);
  return n;
}

/**
 * Minutos de jornada laboral entre dos fechas: solo cuenta lunes a viernes,
 * de 9:00 a 18:30 — lo de fuera (noches, fines de semana) no suma nada. Va
 * recorriendo dia por dia; un ticket no lleva meses abierto, asi que nunca
 * son mas que un puñado de iteraciones.
 */
export function minutosHabiles(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0;
  let total = 0;
  let cursor = new Date(desde);

  while (cursor < hasta) {
    if (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor = inicioSiguienteDiaHabil(cursor);
      continue;
    }
    const minutosDia = cursor.getHours() * 60 + cursor.getMinutes();
    if (minutosDia < JORNADA_INICIO_MIN) {
      cursor.setHours(9, 0, 0, 0);
      continue;
    }
    if (minutosDia >= JORNADA_FIN_MIN) {
      cursor = inicioSiguienteDiaHabil(cursor);
      continue;
    }
    const finJornada = new Date(cursor);
    finJornada.setHours(18, 30, 0, 0);
    const limite = hasta < finJornada ? hasta : finJornada;
    total += (limite.getTime() - cursor.getTime()) / 60_000;
    cursor = limite.getTime() === finJornada.getTime() ? inicioSiguienteDiaHabil(limite) : limite;
  }
  return Math.round(total);
}
