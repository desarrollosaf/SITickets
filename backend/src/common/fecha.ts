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
