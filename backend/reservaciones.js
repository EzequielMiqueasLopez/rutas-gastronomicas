const express = require('express');
const Database = require('./database');
const { soloAdmin } = require('./auth');

const router = express.Router();
const db = Database.getInstance();

// Crear una reservación con los platillos que eligió el cliente
router.post('/', async (req, res) => {
  const { id_negocio, fecha, hora, personas, notas, platillos } = req.body;
  const id_usuario = req.usuario.id_usuario; // viene del token

  if (!id_usuario || !id_negocio || !fecha || !hora || !personas) {
    return res.status(400).json({ error: 'Faltan datos de la reservación' });
  }

  const numPersonas = Number(personas);
  if (!Number.isInteger(numPersonas) || numPersonas < 1 || numPersonas > 20) {
    return res.status(400).json({ error: 'El número de personas debe ser de 1 a 20' });
  }

  const momento = new Date(`${fecha}T${hora}`);
  if (isNaN(momento) || momento < new Date()) {
    return res.status(400).json({ error: 'La fecha y la hora deben ser futuras' });
  }

  // Unir platillos repetidos y validar cantidades
  const pedido = new Map();
  for (const item of platillos || []) {
    const id = Number(item.id_platillo);
    const cant = Number(item.cantidad);
    if (!Number.isInteger(id) || !Number.isInteger(cant) || cant < 1) {
      return res.status(400).json({ error: 'Platillo o cantidad inválidos' });
    }
    const total = (pedido.get(id) || 0) + cant;
    if (total > 20) {
      return res.status(400).json({ error: 'Máximo 20 piezas por platillo' });
    }
    pedido.set(id, total);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `INSERT INTO reservaciones (id_usuario, id_negocio, fecha, hora, personas, notas)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_reservacion`,
      [id_usuario, id_negocio, fecha, hora, numPersonas, notas ? String(notas).slice(0, 300) : null]
    );
    const idReservacion = r.rows[0].id_reservacion;

    if (pedido.size > 0) {
      const ids = [...pedido.keys()];
      const cantidades = ids.map((i) => pedido.get(i));

      // El precio sale del menú del restaurante, nunca del navegador
      const ins = await client.query(
        `INSERT INTO reservacion_platillos (id_reservacion, id_platillo, cantidad, precio_unitario)
         SELECT $1::int, np.id_platillo, x.cantidad, np.precio
         FROM unnest($2::int[], $3::int[]) AS x(id_platillo, cantidad)
         JOIN negocio_platillo np
           ON np.id_platillo = x.id_platillo
          AND np.id_negocio = $4::int
          AND np.disponible = TRUE`,
        [idReservacion, ids, cantidades, id_negocio]
      );

      if (ins.rowCount !== ids.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Un platillo no pertenece al menú de este restaurante' });
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id_reservacion: idReservacion, estado: 'pendiente' });
    avisar('nueva', idReservacion, req.usuario.nombre);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Usuario o restaurante no válido' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la reservación' });
  } finally {
    client.release();
  }
});

// Consulta compartida: reservaciones con cliente, platillos y total
function listar(donde, params) {
  return db.query(
    `SELECT r.id_reservacion,
            u.nombre AS cliente,
            n.nombre AS negocio,
            r.fecha::text AS fecha,
            r.hora::text AS hora,
            r.personas, r.estado, r.notas,
            COALESCE(
              json_agg(
                json_build_object('nombre', p.nombre, 'cantidad', rp.cantidad, 'precio', rp.precio_unitario)
                ORDER BY p.nombre
              ) FILTER (WHERE p.id_platillo IS NOT NULL),
              '[]'
            ) AS platillos,
            COALESCE(SUM(rp.cantidad * rp.precio_unitario), 0) AS total
     FROM reservaciones r
     JOIN usuarios u ON u.id_usuario = r.id_usuario
     JOIN negocios n ON n.id_negocio = r.id_negocio
     LEFT JOIN reservacion_platillos rp ON rp.id_reservacion = r.id_reservacion
     LEFT JOIN platillos p ON p.id_platillo = rp.id_platillo
     ${donde}
     GROUP BY r.id_reservacion, u.nombre, n.nombre
     ORDER BY r.fecha DESC, r.hora DESC`,
    params
  );
}

// Reservaciones del usuario con sesión iniciada
router.get('/mias', async (req, res) => {
  try {
    const result = await listar('WHERE r.id_usuario = $1', [req.usuario.id_usuario]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar reservaciones' });
  }
});

// Todas las reservaciones (solo administrador)
router.get('/todas', soloAdmin, async (req, res) => {
  try {
    const result = await listar('', []);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar reservaciones' });
  }
});

// Cambiar el estado: el admin confirma o cancela; el turista solo cancela la suya
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  const id = Number(req.params.id);
  const esAdmin = req.usuario.rol === 'admin';

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Reservación no válida' });
  }
  if (!['confirmada', 'cancelada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  if (!esAdmin && estado !== 'cancelada') {
    return res.status(403).json({ error: 'Solo puedes cancelar tu reservación' });
  }

  try {
    const result = await db.query(
      `UPDATE reservaciones SET estado = $1
       WHERE id_reservacion = $2
         AND ($3::boolean OR id_usuario = $4)
         AND estado <> 'cancelada'
       RETURNING id_reservacion, estado`,
      [estado, id, esAdmin, req.usuario.id_usuario]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reservación no encontrada, ya cancelada o no es tuya' });
    }
    res.json(result.rows[0]);
    avisar(estado, id, req.usuario.nombre);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la reservación' });
  }
});

// Avisa a n8n (y de ahí a Telegram) cuando una reservación cambia
async function avisar(evento, idReservacion, por) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;

  try {
    const result = await listar('WHERE r.id_reservacion = $1', [idReservacion]);
    const fila = result.rows[0];
    if (!fila) return;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento, por, ...fila }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('No se pudo avisar a n8n:', err.message);
  }
}

module.exports = router;
