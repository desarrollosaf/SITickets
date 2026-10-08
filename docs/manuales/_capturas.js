const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionAdmin, sesionTecnico, sesionSolicitante } = require('./_sesion.js');

const BASE = 'http://localhost:4299';
const IMG = '/Users/jorge/Sites/SITickets/docs/manuales/img';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function setSesion(page, sesion) {
  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' });
  await page.evaluate((s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)), sesion);
}

async function shot(page, nombre, opts = {}) {
  await espera(400);
  await page.screenshot({ path: `${IMG}/${nombre}.png`, fullPage: !!opts.fullPage });
  console.log('capturado:', nombre);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // ---------- LOGIN (pantalla pública, sin sesión) ----------
  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' });
  await shot(page, 'login');

  // ---------- SOLICITANTE ----------
  await setSesion(page, sesionSolicitante());
  await page.goto(`${BASE}/nuevo`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#n-srv option:nth-child(2)', { timeout: 10000 });
  await espera(600);
  await shot(page, 'sol-01-nuevo-vacio');

  // Elegir servicio EQUIPO DE COMPUTO y problema CMP-06 (no pide inventario)
  await page.select('#n-srv', '1');
  await espera(800);
  await page.waitForSelector('#n-prb option[value="CMP-06"]', { timeout: 10000 });
  await page.select('#n-prb', 'CMP-06');
  await espera(600);
  await page.waitForSelector('#n-ctx', { timeout: 10000 });
  await page.type('#n-ctx', 'Microsoft Project');
  await shot(page, 'sol-02-nuevo-lleno');

  await page.click('button.btn-primary');
  await espera(1200);
  await shot(page, 'sol-03-mis-tickets', { fullPage: true });

  // abrir el detalle del ticket recien creado (primer renglon)
  await page.click('table tbody tr');
  await espera(700);
  await shot(page, 'sol-04-detalle-ticket', { fullPage: true });

  await browser.close();
  console.log('fase solicitante lista');
})().catch((e) => { console.error(e); process.exit(1); });
