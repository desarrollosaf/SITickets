import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

/**
 * Fondo de pagina completa (encabezado + pie, 3 copias ya impresas una junto
 * a otra) para las cedulas de salida/entrada de equipo. Formato carta
 * apaisada (11in x 8.5in): la imagen viene proporcionada para calzar exacto
 * en eso.
 */
const RUTA_FONDO = join(process.cwd(), 'assets', 'encabezados-horinzontal 2026.png');

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function fechaLarga(d: Date): string {
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Nunca se debe interpolar texto (nombres, domicilios, etc.) sin esto. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface DatosCedulaCustodia {
  folio: string;
  /** Siempre el solicitante: a quien esta asignado el equipo, entregue o reciba en este movimiento. */
  resguardatarioNombre: string;
  areaAdscripcion: string | null;
  edificio: string | null;
  telefonoExtension: string | null;
  bien: {
    numero_inventario: string;
    nombre_bien: string;
    marca: string | null;
    modelo: string | null;
    numero_serie: string | null;
    color: string | null;
    material: string | null;
  };
  /** Quien entrega en este movimiento: el solicitante en salida, el tecnico en entrada. */
  entregaNombre: string;
  /** Quien recibe en este movimiento: el tecnico en salida, el solicitante en entrada. */
  recibeNombre: string;
}

@Injectable()
export class CedulaCustodiaService {
  private readonly log = new Logger('CedulaCustodia');
  private fondo: string | null | undefined;

  private fondoBase64(): string | null {
    if (this.fondo !== undefined) return this.fondo;
    if (!existsSync(RUTA_FONDO)) {
      this.log.warn(
        'No se encontro assets/encabezados-horinzontal 2026.png: la cedula se genera sin membrete.',
      );
      this.fondo = null;
      return null;
    }
    const buffer = readFileSync(RUTA_FONDO);
    this.fondo = `data:image/png;base64,${buffer.toString('base64')}`;
    return this.fondo;
  }

  /** Genera el PDF de la cedula (3 copias: usuario, tecnico, seguridad) en una sola pagina. */
  async generar(datos: DatosCedulaCustodia): Promise<Buffer> {
    const html = this.plantilla(datos);

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      /* El html no necesita JS; se desactiva por seguridad ya que varios
         campos vienen de captura del solicitante/tecnico. */
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: 'load' });

      const pdf = await page.pdf({
        format: 'letter',
        landscape: true,
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private columna(d: DatosCedulaCustodia, etiquetaCopia: string, hoy: string): string {
    const resguardatario = esc(d.resguardatarioNombre);
    const area = d.areaAdscripcion ? esc(d.areaAdscripcion) : '—';
    const edificio = d.edificio ? esc(d.edificio) : '—';
    const telefono = d.telefonoExtension ? esc(d.telefonoExtension) : '—';
    const entrega = esc(d.entregaNombre);
    const recibe = esc(d.recibeNombre);
    const folio = esc(d.folio);

    const tipoBien = esc(d.bien.nombre_bien || '—');
    const marca = d.bien.marca ? esc(d.bien.marca) : '—';
    const modelo = d.bien.modelo ? esc(d.bien.modelo) : '—';
    const numeroSerie = d.bien.numero_serie ? esc(d.bien.numero_serie) : 'S/N';
    const materialColor =
      d.bien.material || d.bien.color
        ? `${d.bien.material ? esc(d.bien.material) : '—'} / ${d.bien.color ? esc(d.bien.color) : '—'}`
        : 'S/N';

    return `
      <div class="columna">
        <div class="copia">${etiquetaCopia}</div>
        <div class="titulo">
          CÉDULA DE REGISTRO PARA LA ENTREGA<br />
          Y RETIRO DE EQUIPO INFORMÁTICO EN REVISIÓN Y/O REPARACIÓN
        </div>
        <div class="fecha">${hoy}</div>

        <table class="datos">
          <tr><td class="etq">Nombre del resguardatario:</td><td>${resguardatario}</td></tr>
          <tr><td class="etq">Área de adscripción:</td><td>${area}</td></tr>
          <tr><td class="etq">Edificio:</td><td>${edificio}</td></tr>
          <tr><td class="etq">Número telefónico y extensión:</td><td>${telefono}</td></tr>
        </table>

        <div class="subtitulo">DATOS DEL EQUIPO</div>
        <table class="datos">
          <tr><td class="etq">Número de inventario:</td><td>${esc(d.bien.numero_inventario)}</td></tr>
          <tr><td class="etq">Tipo de bien / Marca / Modelo:</td><td>${tipoBien} / ${marca} / ${modelo}</td></tr>
          <tr><td class="etq">Número de serie:</td><td>${numeroSerie}</td></tr>
          <tr><td class="etq">Material y color:</td><td>${materialColor}</td></tr>
        </table>

        <div class="firmas">
          <div class="firma">
            ENTREGA
            <span class="linea">________________________________</span>
            ${entrega}
          </div>
          <div class="firma">
            RECIBE
            <span class="linea">________________________________</span>
            ${recibe}
          </div>
        </div>

        <p class="legal">
          Ticket folio: <strong>${folio}</strong>. Por este conducto, el Departamento de Soporte
          Técnico y Telecomunicaciones, se hace responsable del equipo señalado en la sección
          Datos del Equipo de la presente Cédula, mientras es revisado y en su caso reparado.
          Una vez entregado el equipo al correspondiente resguardatario, la presente cédula y su
          párrafo anterior, quedan sin efecto ni responsabilidad para el servidor público que
          retiró el equipo.
        </p>
      </div>`;
  }

  private plantilla(d: DatosCedulaCustodia): string {
    const hoy = fechaLarga(new Date());
    const fondo = this.fondoBase64();
    const columnas = [
      this.columna(d, 'COPIA USUARIO', hoy),
      this.columna(d, 'COPIA TÉCNICO', hoy),
      this.columna(d, 'COPIA SEGURIDAD', hoy),
    ].join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    width: 11in;
    height: 8.5in;
    font-family: Helvetica, Arial, sans-serif;
    color: #111;
    ${fondo ? `background-image: url(${fondo}); background-size: 100% 100%; background-repeat: no-repeat;` : ''}
  }
  .pagina { display: flex; width: 100%; height: 100%; }
  .columna {
    width: 33.333%;
    padding: 1.55in 0.35in 1.15in;
    font-size: 9.5px;
    line-height: 1.35;
  }
  .copia { font-weight: bold; font-size: 10px; margin-bottom: 6px; }
  .titulo { font-weight: bold; text-align: center; font-size: 10.5px; margin-bottom: 8px; }
  .fecha { text-align: center; margin-bottom: 14px; }
  .subtitulo { font-weight: bold; margin: 10px 0 4px; }
  table.datos { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.datos td { padding: 2px 0; vertical-align: top; }
  table.datos td.etq { font-weight: bold; white-space: nowrap; padding-right: 6px; }
  .firmas { display: flex; justify-content: space-between; margin: 22px 0 14px; text-align: center; }
  .firma { width: 47%; font-weight: bold; font-size: 9px; }
  .linea { display: block; margin: 22px 0 4px; font-weight: normal; }
  .legal { text-align: justify; font-size: 8px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="pagina">${columnas}</div>
</body>
</html>`;
  }
}
