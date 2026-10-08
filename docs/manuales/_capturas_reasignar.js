const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionAdmin } = require('./_sesion.js');
const BASE = 'http://localhost:4299';
const IMG = '/Users/jorge/Sites/SITickets/docs/manuales/img';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' });
  await page.evaluate((s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)), sesionAdmin());
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle0' });
  await espera(900);
  await page.type('#f-folio', 'DI/5');
  await page.click('#f-folio ~ button, .input-group button');
  await espera(900);
  await page.click('table tbody tr');
  await espera(700);
  await page.click('button ::-p-text(Reasignar)');
  await espera(500);
  await page.screenshot({ path: `${IMG}/adm-02-reasignar-modal.png` });
  console.log('capturado reasignar modal');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
