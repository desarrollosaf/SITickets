const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionSolicitante } = require('./_sesion.js');

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
  await page.evaluate((s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)), sesionSolicitante());

  await page.goto(`${BASE}/mis-tickets`, { waitUntil: 'networkidle0' });
  await espera(900);
  await page.click('table tbody tr');
  await espera(800);
  await shot(page, 'sol-05-resuelto-confirmar');

  await page.click('button ::-p-text(Sí quedó resuelto)');
  await espera(1000);
  await shot(page, 'sol-06-cerrado');

  await browser.close();
  console.log('fase solicitante validar lista');
})().catch((e) => { console.error(e); process.exit(1); });
