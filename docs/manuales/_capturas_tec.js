const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionTecnico } = require('./_sesion.js');

const BASE = 'http://localhost:4299';
const IMG = '/Users/jorge/Sites/SITickets/docs/manuales/img';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, nombre) {
  await espera(500);
  await page.screenshot({ path: `${IMG}/${nombre}.png` });
  console.log('capturado:', nombre);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' });
  await page.evaluate(
    (s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)),
    sesionTecnico(8, 'BARRIOS DOMÍNGUEZ GABRIEL ALBERTO'),
  );

  await page.goto(`${BASE}/bandeja`, { waitUntil: 'networkidle0' });
  await espera(900);
  await shot(page, 'tec-01-bandeja');

  await page.click('table tbody tr');
  await espera(800);
  await shot(page, 'tec-02-detalle-asignado');

  // Iniciar reloj (sin geo, campos opcionales)
  await page.click('button ::-p-text(Iniciar reloj)');
  await espera(900);
  await shot(page, 'tec-03-reloj-corriendo');

  // Iniciar reloj ya adelanta el estatus a EN_ATENCION automaticamente.
  // Abrir "Atender ticket"
  await page.click('button ::-p-text(Atender ticket)');
  await espera(500);
  await page.select('#fm-resultado', 'reparado');
  await espera(300);
  await page.type('#fm-cmp-dx', 'El programa no abría por una licencia vencida');
  await page.type('#fm-cmp-sol', 'Se reinstaló y activó con la licencia institucional vigente');
  await page.type('#fm-cmp-ref', 'Ninguna');
  await shot(page, 'tec-05-atender-formulario');

  await page.click('button ::-p-text(Finalizar ticket)');
  await espera(1200);
  await shot(page, 'tec-06-resuelto');

  await browser.close();
  console.log('fase tecnico lista');
})().catch((e) => { console.error(e); process.exit(1); });
