import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';

/**
 * Membrete institucional completo (encabezado + pie de pagina color vino),
 * una sola imagen de pagina completa — mismo patron que membrete_soporte.jpg
 * en el sistema anterior. Se recorta en dos franjas (encabezado/pie) para
 * usarse como header/footer que Puppeteer repite en cada pagina.
 *
 * Si el archivo no esta presente, el dictamen se genera igual mente, solo
 * que sin membrete (texto plano en su lugar), para que la funcion completa
 * quede operando aunque el archivo aun no se haya colocado.
 */
const RUTA_MEMBRETE = join(process.cwd(), 'assets', 'membrete.jpg');
const RECORTE_ENCABEZADO = 0.19;
const RECORTE_PIE = 0.085;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function fechaLarga(d: Date): string {
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Nunca se debe interpolar texto (nombre, observaciones del tecnico, etc.) sin esto. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface DatosDictamen {
  folio: string;
  solicitanteNombre: string;
  dependencia: string | null;
  direccion: string | null;
  departamento: string | null;
  servicioNombre: string;
  bien: {
    numero_inventario: string;
    nombre_bien: string;
    material: string | null;
    marca: string | null;
    modelo: string | null;
  };
  observaciones: string;
  tecnicoNombre: string;
  fotos: { buffer: Buffer; mimetype: string }[];
}

@Injectable()
export class DictamenService {
  private readonly log = new Logger('Dictamen');
  private recortes: { encabezado: string; pie: string } | null | undefined;

  private async recortesMembrete(): Promise<{ encabezado: string; pie: string } | null> {
    if (this.recortes !== undefined) return this.recortes;

    if (!existsSync(RUTA_MEMBRETE)) {
      this.log.warn('No se encontro assets/membrete.png: el dictamen se genera sin membrete.');
      this.recortes = null;
      return null;
    }

    try {
      const meta = await sharp(RUTA_MEMBRETE).metadata();
      const ancho = meta.width!;
      const alto = meta.height!;

      const encabezado = await sharp(RUTA_MEMBRETE)
        .extract({ left: 0, top: 0, width: ancho, height: Math.round(alto * RECORTE_ENCABEZADO) })
        .png()
        .toBuffer();

      const altoPie = Math.round(alto * RECORTE_PIE);
      const pie = await sharp(RUTA_MEMBRETE)
        .extract({ left: 0, top: alto - altoPie, width: ancho, height: altoPie })
        .png()
        .toBuffer();

      this.recortes = {
        encabezado: `data:image/png;base64,${encabezado.toString('base64')}`,
        pie: `data:image/png;base64,${pie.toString('base64')}`,
      };
    } catch (e) {
      this.log.warn(`No se pudo procesar el membrete: ${(e as Error).message}`);
      this.recortes = null;
    }
    return this.recortes;
  }

  /** Genera el PDF del dictamen tecnico de baja. */
  async generar(datos: DatosDictamen): Promise<Buffer> {
    const recortes = await this.recortesMembrete();
    const html = this.plantilla(datos);

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      /* El html no necesita JS para nada; se desactiva por seguridad, ya que
         observaciones/nombres vienen de la captura del tecnico. */
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: 'load' });

      const headerTemplate = recortes
        ? `<div style="width:100%;"><img src="${recortes.encabezado}" style="width:100%; display:block;" /></div>`
        : `<div style="width:100%; text-align:center; font-family:Helvetica; font-size:9px; color:#666;">
             Dirección de Informática · Departamento de Soporte Técnico y Telecomunicaciones
           </div>`;

      const footerTemplate = recortes
        ? `<div style="width:100%;">
             <img src="${recortes.pie}" style="width:100%; display:block;" />
             <div style="text-align:center; font-family:Helvetica; font-size:8px; color:#666; margin-top:2px;">
               Página <span class="pageNumber"></span> / <span class="totalPages"></span>
             </div>
           </div>`
        : `<div style="width:100%; text-align:center; font-family:Helvetica; font-size:8px; color:#666;">
             Página <span class="pageNumber"></span> / <span class="totalPages"></span>
           </div>`;

      const pdf = await page.pdf({
        format: 'letter',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '6.2cm', bottom: '3cm', left: '1.5cm', right: '1cm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private plantilla(d: DatosDictamen): string {
    const hoy = fechaLarga(new Date());
    const dependencia = d.dependencia ? esc(d.dependencia) : null;
    const direccion = d.direccion ? esc(d.direccion) : null;
    const departamento = d.departamento ? esc(d.departamento) : null;
    const bien = {
      numero_inventario: esc(d.bien.numero_inventario),
      nombre_bien: esc(d.bien.nombre_bien),
      material: d.bien.material ? esc(d.bien.material) : '—',
      marca: d.bien.marca ? esc(d.bien.marca) : '—',
      modelo: d.bien.modelo ? esc(d.bien.modelo) : '—',
    };
    const solicitante = esc(d.solicitanteNombre);
    const servicio = esc(d.servicioNombre).toUpperCase();
    const tecnico = esc(d.tecnicoNombre).toUpperCase();
    const observaciones = esc(d.observaciones).toUpperCase();

    const anexoFotos = d.fotos.length
      ? `
        <div style="page-break-inside:avoid; margin-top:24px;">
          <p style="font-weight:bold; margin-bottom:10px;">ANEXO FOTOGRÁFICO</p>
          <table style="width:100%; border-collapse:collapse; border:1px solid #000; font-size:11px; font-family:Helvetica;">
            <tr>
              <td style="padding:4px; border:1px solid #000;"><strong>Número de inventario:</strong> ${bien.numero_inventario}</td>
              <td style="padding:4px; border:1px solid #000;"><strong>Activo:</strong> ${bien.nombre_bien}</td>
              <td style="padding:4px; border:1px solid #000;"><strong>Grupo:</strong> ${bien.material}</td>
            </tr>
            <tr>
              <td style="padding:4px; border:1px solid #000;" colspan="2"><strong>Marca:</strong> ${bien.marca}</td>
              <td style="padding:4px; border:1px solid #000;"><strong>Modelo:</strong> ${bien.modelo}</td>
            </tr>
          </table>
          <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:16px;">
            ${d.fotos
              .map((f) => {
                const tipo = f.mimetype === 'image/png' ? 'image/png' : 'image/jpeg';
                return `<img src="data:${tipo};base64,${f.buffer.toString('base64')}"
                             style="max-width:47%; max-height:280px; object-fit:contain; border:1px solid #ccc;" />`;
              })
              .join('')}
          </div>
        </div>`
      : '';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 14px; color:#111; line-height:1.5; margin:0; }
  p { margin: 0 0 12px; }
  .justif { text-align: justify; }
  .fecha { text-align:right; font-size:13px; margin-bottom:26px; }
  .saludo { font-weight:bold; margin-bottom:18px; }
  ul { padding-left: 20px; margin: 0 0 12px; }
  li { margin-bottom: 10px; text-align: justify; }
  .salto { page-break-before: always; }
  .firmas { display:flex; justify-content:space-around; margin-top:48px; text-align:center; font-weight:bold; }
  .firmas div { width:45%; }
  .linea { display:block; margin-bottom:6px; font-weight:normal; }
</style>
</head>
<body>
  <div class="fecha">
    Toluca, Estado de México, ${hoy}<br />
    Dictamen Técnico núm. DT/${esc(d.folio)}
  </div>

  <div class="saludo">
    C. ${solicitante}<br />
    ${direccion ? direccion + '<br />' : ''}
    DE LA ${(dependencia ?? '').toUpperCase()}<br />
    P R E S E N T E
  </div>

  <p class="justif">
    Derivado de reporte realizado a través del sistema eService–Ticket con folio de registro
    ${esc(d.folio)}; del tipo de servicio ${servicio} y con fundamento en lo dispuesto en las
    Normas DI 4 y DI 11 contenidas en el Título VI denominado “Tecnologías de la Información y
    Comunicación” de las Normas Administrativas del Poder Legislativo del Estado de México; el
    Manual General de Organización de la Secretaría de Administración y Finanzas, y el artículo
    17 fracciones II y V del Reglamento Interno de la Secretaría de Administración y Finanzas del
    Poder Legislativo del Estado de México; por lo que se confiere facultades para otorgar el
    servicio de soporte técnico, emisión de dictámenes técnicos; entre otros. Se emite el
    presente “Dictamen Técnico” para el equipo informático con
    <strong>Número de inventario: ${bien.numero_inventario},</strong> Activo: ${bien.nombre_bien},
    Grupo: ${bien.material}, Marca: ${bien.marca} y Modelo: ${bien.modelo}, asignado a la persona
    servidora pública <strong>C. ${solicitante},</strong>
    adscrita a <strong>${departamento ?? dependencia ?? '—'}</strong>
    de ${(dependencia ?? '').toUpperCase()}.
  </p>

  <p><strong>I. CONSIDERACIONES</strong></p>
  <ul>
    <li>
      El presente dictamen es de observancia obligatoria y no puede ser alterado o modificado bajo
      ninguna circunstancia y/o adicionar cualquier otro tipo de bienes y/o servicios fuera de lo
      aquí expresado, sin la autorización por escrito del área responsable.
    </li>
    <li>
      La persona servidora pública interesada, sin menoscabo a lo dispuesto en el presente
      dictamen técnico, debe apegarse a lo aquí estipulado de conformidad con lo establecido en
      las Normas DI 4 y DI 11 contenidas en el Título VI denominado “Tecnologías de la Información
      y Comunicación” de las Normas Administrativas del Poder Legislativo del Estado de México; el
      Manual General de Organización de la Secretaría de Administración y Finanzas, y el artículo
      17 fracciones II y V del Reglamento Interno de la Secretaría de Administración y Finanzas
      del Poder Legislativo del Estado de México.
    </li>
  </ul>

  <div class="salto">
    <p><strong>II. DICTAMEN</strong></p>
    <p class="justif">${observaciones}</p>

    <p style="text-align:center; font-weight:bold; margin-top:36px;">ATENTAMENTE</p>

    <div class="firmas">
      <div>
        <span class="linea">________________________________</span>
        CESAR RANGEL ROJAS<br />
        JEFE DEL DEPARTAMENTO DE<br />
        SOPORTE TÉCNICO
      </div>
      <div>
        <span class="linea">________________________________</span>
        ${tecnico}<br />
        TÉCNICO ASIGNADO PARA<br />
        LA REVISION
      </div>
    </div>

    ${anexoFotos}
  </div>
</body>
</html>`;
  }
}
