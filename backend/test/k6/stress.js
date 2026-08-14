/**
 * Prueba de stress para SITickets (API NestJS).
 *
 * Uso:
 *   k6 run \
 *     -e BASE_URL=https://siasaf.gob.mx/sitickets/backend/api \
 *     -e RFC=XXXX000000XXX \
 *     -e PASSWORD='...' \
 *     backend/test/k6/stress.js
 *
 * Variables de entorno:
 *   BASE_URL   URL base del API, sin slash final. Default: staging.
 *   RFC        RFC del usuario de prueba (rol solicitante). Obligatorio.
 *   PASSWORD   Password de ese usuario. Obligatorio.
 *   PROBLEMA   Clave de catalogo para crear tickets. Default: CMP-01.
 *   SCENARIO   'smoke' (1 VU, pocas iteraciones, valida que el script sirve)
 *              o 'stress' (rampa de carga). Default: stress.
 *
 * El login solo se hace una vez en setup(): /auth/login tiene throttling de
 * 5 intentos/min por IP (ver auth.controller.ts), así que todas las VUs
 * comparten el mismo token en vez de autenticarse cada una.
 */

import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://siasaf.gob.mx/sitickets/backend/api').replace(/\/+$/, '');
const RFC = __ENV.RFC;
const PASSWORD = __ENV.PASSWORD;
const PROBLEMA = __ENV.PROBLEMA || 'CMP-01';
const SCENARIO = __ENV.SCENARIO || 'stress';

const errores = new Rate('errores_negocio');
const duracionCrear = new Trend('duracion_crear_ticket');

const escenarios = {
  smoke: {
    executor: 'per-vu-iterations',
    vus: 1,
    iterations: 5,
    maxDuration: '1m',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 25 },
      { duration: '1m', target: 25 },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },
};

export const options = {
  scenarios: { principal: escenarios[SCENARIO] },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    errores_negocio: ['rate<0.01'],
  },
};

export function setup() {
  if (!RFC || !PASSWORD) {
    fail('Faltan RFC y/o PASSWORD. Pasalos con -e RFC=... -e PASSWORD=...');
  }

  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ rfc: RFC, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const ok = check(res, {
    'login: 200': (r) => r.status === 200,
    'login: trae token': (r) => !!r.json('token'),
  });
  if (!ok) {
    fail(`No se pudo autenticar contra ${BASE_URL} (status ${res.status}): ${res.body}`);
  }

  return { token: res.json('token') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  group('listar tickets', () => {
    const res = http.get(`${BASE_URL}/tickets`, { headers, tags: { name: 'GET /tickets' } });
    const ok = check(res, {
      'listar: 200': (r) => r.status === 200,
      'listar: es arreglo': (r) => Array.isArray(r.json()),
    });
    errores.add(!ok);

    const lista = ok ? res.json() : [];
    if (lista.length > 0) {
      const id = lista[Math.floor(Math.random() * lista.length)].id;
      group('detalle ticket', () => {
        const r2 = http.get(`${BASE_URL}/tickets/${id}`, {
          headers,
          tags: { name: 'GET /tickets/:id' },
        });
        errores.add(!check(r2, { 'detalle: 200': (r) => r.status === 200 }));
      });
    }
  });

  sleep(1);

  /* ~20% de las iteraciones dan de alta un ticket y lo cancelan de inmediato,
     para no dejar basura de prueba acumulandose en la base. */
  if (Math.random() < 0.2) {
    group('crear + cancelar ticket', () => {
      const inicio = Date.now();
      const resCrear = http.post(
        `${BASE_URL}/tickets`,
        JSON.stringify({ problema: PROBLEMA, contexto: 'k6 stress test' }),
        { headers, tags: { name: 'POST /tickets' } },
      );
      duracionCrear.add(Date.now() - inicio);

      const creado = check(resCrear, { 'crear: 201/200': (r) => r.status === 200 || r.status === 201 });
      errores.add(!creado);
      if (!creado) return;

      const id = resCrear.json('id');
      const resCancelar = http.post(
        `${BASE_URL}/tickets/${id}/cancelar`,
        JSON.stringify({ motivo: 'Limpieza automatica de prueba de stress (k6)' }),
        { headers, tags: { name: 'POST /tickets/:id/cancelar' } },
      );
      errores.add(!check(resCancelar, { 'cancelar: 200': (r) => r.status === 200 }));
    });
  }

  sleep(1);
}
