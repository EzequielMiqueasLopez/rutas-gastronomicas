const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const Database = require('./database');
const reservaciones = require('./reservaciones');
const { firmar, requerirSesion, soloAdmin } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

const db = Database.getInstance();

app.get('/', (req, res) => res.json({ mensaje: 'API Rutas Gastronómicas funcionando' }));

// Solo el administrador puede ver la lista de usuarios
app.get('/usuarios', requerirSesion, soloAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id_usuario, nombre, correo, rol, activo FROM usuarios ORDER BY id_usuario'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar usuarios' });
  }
});

app.get('/negocios', requerirSesion, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT n.id_negocio, n.nombre, c.nombre AS categoria, n.direccion, n.horario,
             ST_Y(n.ubicacion::geometry) AS latitud,
             ST_X(n.ubicacion::geometry) AS longitud
      FROM negocios n
      JOIN categorias c ON c.id_categoria = n.id_categoria
      ORDER BY n.id_negocio
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar negocios' });
  }
});

// Registro: siempre crea usuarios con rol "turista"
app.post('/registro', async (req, res) => {
  const { nombre, correo, password } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO usuarios (nombre, correo, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id_usuario, nombre, correo, rol`,
      [nombre.trim(), correo.trim().toLowerCase(), hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// Login: compara la contraseña contra el hash y devuelve un token
app.post('/login', async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const result = await db.query(
      `SELECT id_usuario, nombre, correo, rol, activo, password_hash
       FROM usuarios WHERE correo = $1`,
      [correo.trim().toLowerCase()]
    );
    const u = result.rows[0];
    const ok = u && u.activo && (await bcrypt.compare(password, u.password_hash));

    if (!ok) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const { password_hash, ...usuario } = u;
    res.json({ ...usuario, token: firmar(usuario) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Negocios con sus platillos y precios
app.get('/negocios-con-platillos', requerirSesion, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT n.id_negocio, n.nombre, c.nombre AS categoria, n.direccion, n.horario,
             ST_Y(n.ubicacion::geometry) AS latitud,
             ST_X(n.ubicacion::geometry) AS longitud,
             COALESCE(
               json_agg(
                 json_build_object('id_platillo', p.id_platillo, 'nombre', p.nombre, 'precio', np.precio)
                 ORDER BY p.nombre
               ) FILTER (WHERE p.id_platillo IS NOT NULL),
               '[]'
             ) AS platillos
      FROM negocios n
      JOIN categorias c ON c.id_categoria = n.id_categoria
      LEFT JOIN negocio_platillo np ON np.id_negocio = n.id_negocio AND np.disponible = TRUE
      LEFT JOIN platillos p ON p.id_platillo = np.id_platillo
      GROUP BY n.id_negocio, c.nombre
      ORDER BY n.id_negocio
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar negocios' });
  }
});

// Rutas con sus paradas en orden y la distancia total (PostGIS)
app.get('/rutas', requerirSesion, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.id_ruta, r.nombre, r.descripcion, r.tema, r.duracion_min,
             (
               SELECT ROUND(SUM(x.metros))
               FROM (
                 SELECT ST_Distance(
                          n2.ubicacion,
                          LAG(n2.ubicacion) OVER (ORDER BY rp2.orden)
                        ) AS metros
                 FROM ruta_paradas rp2
                 JOIN negocios n2 ON n2.id_negocio = rp2.id_negocio
                 WHERE rp2.id_ruta = r.id_ruta
               ) x
             ) AS distancia_m,
             COALESCE(
               json_agg(
                 json_build_object(
                   'orden', rp.orden,
                   'negocio', n.nombre,
                   'categoria', c.nombre,
                   'tiempo', rp.tiempo_sugerido_min,
                   'nota', rp.nota
                 ) ORDER BY rp.orden
               ) FILTER (WHERE rp.id_negocio IS NOT NULL),
               '[]'
             ) AS paradas
      FROM rutas r
      LEFT JOIN ruta_paradas rp ON rp.id_ruta = r.id_ruta
      LEFT JOIN negocios n ON n.id_negocio = rp.id_negocio
      LEFT JOIN categorias c ON c.id_categoria = n.id_categoria
      WHERE r.activa = TRUE
      GROUP BY r.id_ruta
      ORDER BY r.id_ruta
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar rutas' });
  }
});

// Reservaciones: requieren sesión iniciada
app.use('/reservaciones', requerirSesion, reservaciones);

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));
