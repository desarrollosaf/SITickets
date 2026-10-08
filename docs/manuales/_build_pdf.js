const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const archivo = process.argv[2];
const titulo = process.argv[3] || '';
if (!archivo) { console.error('uso: node _build_pdf.js <archivo.html> "<Nombre del manual>"'); process.exit(1); }

const rutaHtml = path.resolve(archivo);
const rutaPdf = rutaHtml.replace(/\.html$/, '.pdf');

const rutaLogo = '/Users/jorge/Sites/SITickets/backend/assets/manuales/congreso-saf.svg';
const logoDataUri = `data:image/svg+xml;base64,${fs.readFileSync(rutaLogo).toString('base64')}`;

const headerTemplate = `
<div style="width:100%; font-family: 'Segoe UI', Arial, sans-serif; font-size:7.5pt; color:#5c6a7e;
            padding:0 46pt; margin:0; display:flex; align-items:center; gap:7pt;
            border-bottom:0.75pt solid #dfe4ea; box-sizing:border-box; height:16mm;">
  <img src="${logoDataUri}" style="height:16pt; width:auto;" />
  <span style="font-weight:700; color:#95134b;">MESA DE AYUDA</span>
  <span style="opacity:.6;">·</span>
  <span>${titulo}</span>
</div>`;

const footerTemplate = `
<div style="width:100%; font-family: 'Segoe UI', Arial, sans-serif; font-size:7.5pt; color:#9aa4b2;
            padding:0 46pt; margin:0; text-align:right; box-sizing:border-box;">
  Página <span class="pageNumber"></span> de <span class="totalPages"></span>
</div>`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  // ---- 1) Portada: pagina suelta, sin header/footer, sangrado completo ----
  const pagina1 = await browser.newPage();
  await pagina1.goto(`file://${rutaHtml}`, { waitUntil: 'networkidle0' });
  await pagina1.addStyleTag({ content: '.indice, .contenido { display: none !important; }' });
  const bufPortada = await pagina1.pdf({
    printBackground: true,
    width: '210mm',
    height: '297mm',
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await pagina1.close();

  // ---- 2) Indice + contenido: con encabezado y pie en cada hoja ----
  const pagina2 = await browser.newPage();
  await pagina2.goto(`file://${rutaHtml}`, { waitUntil: 'networkidle0' });
  await pagina2.addStyleTag({ content: '.portada { display: none !important; } .indice { page-break-after: always; }' });
  const bufContenido = await pagina2.pdf({
    printBackground: true,
    width: '210mm',
    height: '297mm',
    margin: { top: '20mm', bottom: '14mm', left: 0, right: 0 },
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
  });
  await pagina2.close();
  await browser.close();

  // ---- 3) Unir ambos PDF ----
  const final = await PDFDocument.create();
  const docPortada = await PDFDocument.load(bufPortada);
  const docContenido = await PDFDocument.load(bufContenido);
  const [p1] = await final.copyPages(docPortada, [0]);
  final.addPage(p1);
  const paginas2 = await final.copyPages(docContenido, docContenido.getPageIndices());
  paginas2.forEach((p) => final.addPage(p));

  fs.writeFileSync(rutaPdf, await final.save());
  console.log('PDF generado:', rutaPdf, `(${final.getPageCount()} paginas)`);
})().catch((e) => { console.error(e); process.exit(1); });
