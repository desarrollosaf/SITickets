// Helper: genera una sesión válida (JWT + objeto usuario) para inyectar en localStorage.
const jwt = require('/Users/jorge/Sites/SITickets/backend/node_modules/jsonwebtoken');

const SECRETO = 'cambia_este_secreto_por_uno_largo_y_aleatorio';

function sesionAdmin() {
  const token = jwt.sign({ sub: 27, externo: false }, SECRETO, { expiresIn: '2h' });
  return {
    token,
    usuario: {
      id: 27, nombre: 'RANGEL ROJAS CESAR', correo: 'cesar.rangel@congresoedomex.gob.mx',
      rol: 'admin', extension: null, dependencia: null, area: null,
      dependencia_id: null, area_id: null, siempreANombrePropio: false,
    },
  };
}

function sesionTecnico(id, nombre) {
  const token = jwt.sign({ sub: id, externo: false }, SECRETO, { expiresIn: '2h' });
  return {
    token,
    usuario: {
      id, nombre, correo: null, rol: 'tecnico', extension: null, dependencia: null, area: null,
      dependencia_id: null, area_id: null, siempreANombrePropio: false,
    },
  };
}

function sesionSolicitante() {
  const token = jwt.sign({ sub: 1224, externo: true }, SECRETO, { expiresIn: '2h' });
  return {
    token,
    usuario: {
      id: 1224, nombre: 'GARCÍA NAVA JORGE LUIS', correo: null, rol: 'solicitante',
      extension: null, dependencia: 'SECRETARÍA DE ADMINISTRACIÓN Y FINANZAS', area: null,
      dependencia_id: null, area_id: null, siempreANombrePropio: false,
    },
  };
}

module.exports = { sesionAdmin, sesionTecnico, sesionSolicitante };
