const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionTecnico } = require('./_sesion.js');
const BASE = 'http://localhost:4299';
const IMG = '/Users/jorge/Sites/SITickets/docs/manuales/img';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' });
  await page.evaluate(
    (s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)),
    sesionTecnico(9, 'VILLA HERNÁNDEZ HUGO CESAR'),
  );
  await page.goto(`${BASE}/bandeja`, { waitUntil: 'networkidle0' });
  await espera(900);
  await page.click('table tbody tr');
  await espera(700);
  await page.click('button ::-p-text(Iniciar reloj)');
  await espera(900);
  await page.click('button ::-p-text(Atender ticket)');
  await espera(500);
  await page.select('#fm-resultado', 'baja');
  await espera(400);
  await page.type(
    '#fm-observaciones',
    'EL EQUIPO PRESENTA DAÑO FÍSICO EN LA TARJETA MADRE POR UNA DESCARGA ELÉCTRICA Y NO ENCIENDE; SE DICTAMINA SU BAJA.',
  );
  await espera(300);
  await page.screenshot({ path: `${IMG}/tec-07-atender-baja.png` });
  console.log('capturado formulario de baja');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
