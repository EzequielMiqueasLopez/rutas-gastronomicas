require('dotenv').config();
const jwt = require('jsonwebtoken');

const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.error('Falta JWT_SECRET en el archivo .env');
  process.exit(1);
}

// Crea el token que recibe el navegador al iniciar sesión (dura 8 horas)
function firmar(usuario) {
  return jwt.sign(
    { id_usuario: usuario.id_usuario, rol: usuario.rol, nombre: usuario.nombre },
    SECRETO,
    { expiresIn: '8h' }
  );
}

// Exige un token válido en la cabecera Authorization: Bearer <token>
function requerirSesion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Inicia sesión para continuar' });
  }

  try {
    req.usuario = jwt.verify(token, SECRETO);
    next();
  } catch {
    res.status(401).json({ error: 'La sesión expiró. Inicia sesión de nuevo' });
  }
}

// Debe usarse después de requerirSesion
function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  }
  next();
}

module.exports = { firmar, requerirSesion, soloAdmin };
