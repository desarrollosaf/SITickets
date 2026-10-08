const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionSolicitante, sesionTecnico } = require('./_sesion.js');
const BASE = 'http://localhost:4299';
const IMG = '/Users/jorge/Sites/SITickets/docs/manuales/img';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // crear ticket demo como solicitante
  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' });
  await page.evaluate((s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)), sesionSolicitante());
  await page.goto(`${BASE}/nuevo`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#n-srv option:nth-child(2)', { timeout: 10000 });
  await page.select('#n-srv', '1');
  await espera(700);
  await page.waitForSelector('#n-prb option[value="CMP-06"]', { timeout: 10000 });
  await page.select('#n-prb', 'CMP-06');
  await espera(500);
  await page.type('#n-ctx', 'Equipo de ejemplo para el manual');
  await page.click('button.btn-primary');
  await espera(1200);

  const url = page.url();
  console.log('ticket creado, revisando id...');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
