const puppeteer = require('/Users/jorge/Sites/SITickets/backend/node_modules/puppeteer-core');
const { sesionAdmin } = require('./_sesion.js');

const BASE = 'http://localhost:4299';
const IMG = '/Users/jorge/Sites/SITickets/docs/manuales/img';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, nombre, full) {
  await espera(600);
  await page.screenshot({ path: `${IMG}/${nombre}.png`, fullPage: !!full });
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
  await page.evaluate((s) => localStorage.setItem('sitickets.sesion', JSON.stringify(s)), sesionAdmin());

  // ---- Todos los tickets + buscador ----
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle0' });
  await espera(900);
  await shot(page, 'adm-01-tickets', true);

  // abrir un ticket y mostrar el boton reasignar (sin enviarlo)
  await page.click('table tbody tr');
  await espera(800);
  const hayReasignar = await page.$('button ::-p-text(Reasignar)');
  if (hayReasignar) {
    await page.click('button ::-p-text(Reasignar)');
    await espera(500);
    await shot(page, 'adm-02-reasignar-modal');
    const cancelar = await page.$('button ::-p-text(Cancelar)');
    if (cancelar) await cancelar.click();
  }
  await page.keyboard.press('Escape').catch(() => {});

  // ---- Monitor de turnos ----
  await page.goto(`${BASE}/monitor`, { waitUntil: 'networkidle0' });
  await shot(page, 'adm-03-monitor', true);

  // ---- Tablero ----
  await page.goto(`${BASE}/tablero`, { waitUntil: 'networkidle0' });
  await espera(1200);
  await shot(page, 'adm-04-tablero', true);

  // ---- Catalogo de servicios ----
  await page.goto(`${BASE}/catalogo-servicios`, { waitUntil: 'networkidle0' });
  await shot(page, 'adm-05-catalogo-servicios', true);

  // ---- Catalogo de problemas ----
  await page.goto(`${BASE}/catalogo-problemas`, { waitUntil: 'networkidle0' });
  await shot(page, 'adm-06-catalogo-problemas', true);

  // ---- Prioridades ----
  await page.goto(`${BASE}/prioridades`, { waitUntil: 'networkidle0' });
  await shot(page, 'adm-07-prioridades');

  // ---- Usuarios ----
  await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle0' });
  await shot(page, 'adm-08-usuarios');

  // ---- Reportes (graficas) ----
  await page.goto(`${BASE}/reportes`, { waitUntil: 'networkidle0' });
  await espera(1800);
  await shot(page, 'adm-09-reportes', true);

  // ---- Equipos dados de baja ----
  await page.goto(`${BASE}/bajas`, { waitUntil: 'networkidle0' });
  await espera(900);
  await shot(page, 'adm-10-bajas');

  await browser.close();
  console.log('fase admin lista');
})().catch((e) => { console.error(e); process.exit(1); });
