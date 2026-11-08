import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

function Autenticacion({ onLogin }) {
  const [modo, setModo] = useState('login');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState(null);

  async function enviar() {
    setMensaje(null);
    const ruta = modo === 'login' ? '/login' : '/registro';
    const cuerpo = modo === 'login' ? { correo, password } : { nombre, correo, password };

    try {
      const res = await fetch(`${API}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error });
        return;
      }

      if (modo === 'registro') {
        setMensaje({ tipo: 'ok', texto: 'Cuenta creada. Ahora inicia sesión.' });
        setModo('login');
        setPassword('');
      } else {
        onLogin(data);
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el backend' });
    }
  }

  return (
    <div className="tarjeta-auth">
      <h2>{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>

      {modo === 'registro' && (
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
      )}

      <label>
        Correo
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </label>

      <label>
        Contraseña
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>

      <button onClick={enviar}>{modo === 'login' ? 'Entrar' : 'Registrarme'}</button>

      {mensaje && <p className={mensaje.tipo}>{mensaje.texto}</p>}

      <p>
        <button
          className="enlace"
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login');
            setMensaje(null);
          }}
        >
          {modo === 'login' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta'}
        </button>
      </p>
    </div>
  );
}

function TarjetaRuta({ ruta, onAbrir }) {
  return (
    <article
      className="tarjeta tarjeta-negocio"
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onAbrir();
      }}
    >
      <div className="ruta-cabecera">
        <h3>{ruta.nombre}</h3>
        {ruta.tema && <span className="insignia">{ruta.tema}</span>}
      </div>

      <p>{ruta.descripcion}</p>

      <div className="datos-ruta">
        <span>Duración: {ruta.duracion_min} min</span>
        <span>Distancia: {ruta.distancia_m ? `${(ruta.distancia_m / 1000).toFixed(2)} km` : '-'}</span>
        <span>{ruta.paradas.length} paradas</span>
      </div>

      <p className="ver-menu">Ver recorrido</p>
    </article>
  );
}

function VentanaRuta({ ruta, onCerrar, onAbrirNegocio }) {
  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">
          &times;
        </button>

        <h2>{ruta.nombre}</h2>
        {ruta.tema && <span className="insignia">{ruta.tema}</span>}
        <p style={{ marginTop: 12 }}>{ruta.descripcion}</p>

        <div className="datos-ruta">
          <span>Duración: {ruta.duracion_min} min</span>
          <span>Distancia: {ruta.distancia_m ? `${(ruta.distancia_m / 1000).toFixed(2)} km` : '-'}</span>
        </div>

        <h3>Restaurantes del recorrido</h3>
        <p>Toca un restaurante para ver su menú.</p>

        <ol className="paradas">
          {ruta.paradas.map((p) => {
            const abrir = () => onAbrirNegocio(p.negocio);
            return (
              <li
                key={p.orden}
                data-orden={p.orden}
                className="clicable"
                role="button"
                tabIndex={0}
                onClick={abrir}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') abrir();
                }}
              >
                <strong>{p.negocio}</strong>
                <small>
                  {p.categoria} - {p.tiempo} min
                </small>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function VentanaNegocio({ negocio, usuario, onCerrar, onReservado }) {
  const hoy = new Date().toLocaleDateString('en-CA');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [personas, setPersonas] = useState(2);
  const [notas, setNotas] = useState('');
  const [cantidades, setCantidades] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const platillos = negocio.platillos || [];
  const total = platillos.reduce(
    (suma, p) => suma + (cantidades[p.id_platillo] || 0) * Number(p.precio),
    0
  );

  function cambiar(id, delta) {
    setCantidades((c) => ({ ...c, [id]: Math.max(0, Math.min(20, (c[id] || 0) + delta)) }));
  }

  async function reservar() {
    setMensaje(null);
    if (!fecha || !hora) {
      setMensaje({ tipo: 'error', texto: 'Elige la fecha y la hora' });
      return;
    }

    const pedido = Object.entries(cantidades)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([id, cantidad]) => ({ id_platillo: Number(id), cantidad }));

    setEnviando(true);
    try {
      const res = await fetch(`${API}/reservaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(usuario) },
        body: JSON.stringify({
          id_negocio: negocio.id_negocio,
          fecha,
          hora,
          personas,
          notas,
          platillos: pedido,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error });
        return;
      }

      setMensaje({ tipo: 'ok', texto: `Reservación #${data.id_reservacion} enviada. Estado: pendiente.` });
      setCantidades({});
      setNotas('');
      onReservado();
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el backend' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">
          &times;
        </button>

        <h2>{negocio.nombre}</h2>
        <span className="insignia">{negocio.categoria}</span>

        <p style={{ marginTop: 12 }}>Dirección: {negocio.direccion}</p>
        <p>Horario: {negocio.horario}</p>

        <h3>Menú</h3>
        <p>Usa + y - para elegir lo que quieres pedir.</p>
        <ul className="platillos">
          {platillos.map((p) => (
            <li key={p.id_platillo}>
              <span>{p.nombre}</span>
              <span className="precio-cantidad">
                <span>${p.precio}</span>
                <span className="cantidad">
                  <button type="button" onClick={() => cambiar(p.id_platillo, -1)}>-</button>
                  <b>{cantidades[p.id_platillo] || 0}</b>
                  <button type="button" onClick={() => cambiar(p.id_platillo, 1)}>+</button>
                </span>
              </span>
            </li>
          ))}
        </ul>
        {total > 0 && <p className="ver-menu">Total estimado: ${total.toFixed(2)}</p>}

        <h3>Reservar mesa</h3>
        <div className="form-reserva">
          <label>
            Fecha
            <input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label>
            Hora
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <label>
            Personas
            <input
              type="number"
              min="1"
              max="20"
              value={personas}
              onChange={(e) => setPersonas(e.target.value)}
            />
          </label>
          <label>
            Notas (opcional)
            <input maxLength={300} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </label>
        </div>

        <button onClick={reservar} disabled={enviando}>
          {enviando ? 'Enviando...' : 'Reservar'}
        </button>
        {mensaje && <p className={mensaje.tipo}>{mensaje.texto}</p>}
      </div>
    </div>
  );
}

function App() {
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [negocios, setNegocios] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [negocioAbierto, setNegocioAbierto] = useState(null);
  const [rutaAbierta, setRutaAbierta] = useState(null);
  const [reservaciones, setReservaciones] = useState([]);
  const [todas, setTodas] = useState([]);
  const [error, setError] = useState(null);

  const cargarReservaciones = (u) =>
    fetch(`${API}/reservaciones/mias`, { headers: auth(u) })
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setReservaciones(d))
      .catch(() => {});

  // Pide datos con el token; si la sesión expiró, cierra la sesión
  const pedir = (ruta, setter) =>
    fetch(`${API}${ruta}`, { headers: auth(usuarioActual) })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setter(d);
        else setUsuarioActual(null);
      })
      .catch(() => setError('No se pudo conectar con el backend'));

  // Cambia el estado de una reservación y recarga las listas
  const cambiarEstado = async (id, estado) => {
    try {
      const res = await fetch(`${API}/reservaciones/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth(usuarioActual) },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setError(null);
      cargarReservaciones(usuarioActual);
      if (usuarioActual.rol === 'admin') pedir('/reservaciones/todas', setTodas);
    } catch {
      setError('No se pudo conectar con el backend');
    }
  };

  useEffect(() => {
    if (!usuarioActual) {
      setNegocios([]);
      setUsuarios([]);
      setRutas([]);
      setNegocioAbierto(null);
      setRutaAbierta(null);
      setReservaciones([]);
      setTodas([]);
      return;
    }

    cargarReservaciones(usuarioActual);

    pedir('/rutas', setRutas);
    pedir('/negocios-con-platillos', setNegocios);

    if (usuarioActual.rol === 'admin') {
      pedir('/usuarios', setUsuarios);
      pedir('/reservaciones/todas', setTodas);
    }
  }, [usuarioActual]);

  // Cerrar la ventana con la tecla Escape
  useEffect(() => {
    if (!negocioAbierto && !rutaAbierta) return;
    const alPresionar = (e) => {
      if (e.key !== 'Escape') return;
      if (negocioAbierto) setNegocioAbierto(null);
      else setRutaAbierta(null);
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [negocioAbierto, rutaAbierta]);

  return (
    <>
      <header className="barra">
        <div className="contenedor">
          <span className="logo">Rutas Gastronómicas</span>
          {usuarioActual && (
            <div className="sesion">
              <span>{usuarioActual.nombre}</span>
              <span className="insignia">{usuarioActual.rol}</span>
              <button className="secundario" onClick={() => setUsuarioActual(null)}>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="papel-picado" />

      <main className="contenedor">
        <section className="hero">
          <h1>Descubre el sabor de Tuxtla Gutiérrez</h1>
          <p>Rutas, platillos típicos y negocios locales en un solo lugar.</p>
        </section>

        {error && <p className="error">{error}</p>}

        {!usuarioActual && <Autenticacion onLogin={setUsuarioActual} />}

        {usuarioActual && (
          <>
            <h2>Rutas gastronómicas</h2>
            <div className="rejilla-rutas">
              {rutas.map((r) => (
                <TarjetaRuta key={r.id_ruta} ruta={r} onAbrir={() => setRutaAbierta(r)} />
              ))}
            </div>

            <h2>Mis reservaciones</h2>
            {reservaciones.length === 0 ? (
              <p>Aún no tienes reservaciones. Entra a una ruta, elige un restaurante y reserva.</p>
            ) : (
              <div className="rejilla-rutas">
                {reservaciones.map((r) => (
                  <article className="tarjeta" key={r.id_reservacion}>
                    <div className="ruta-cabecera">
                      <h3>{r.negocio}</h3>
                      <span className={`insignia estado-${r.estado}`}>{r.estado}</span>
                    </div>
                    <p>
                      {r.fecha} a las {r.hora.slice(0, 5)} - {r.personas} personas
                    </p>
                    {r.notas && <p>Notas: {r.notas}</p>}
                    <ul className="platillos">
                      {r.platillos.map((p) => (
                        <li key={p.nombre}>
                          <span>
                            {p.cantidad} x {p.nombre}
                          </span>
                          <span>${(p.cantidad * Number(p.precio)).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                    {r.platillos.length > 0 && (
                      <p className="ver-menu">Total: ${Number(r.total).toFixed(2)}</p>
                    )}
                    {r.estado !== 'cancelada' && (
                      <button
                        className="secundario"
                        style={{ marginTop: 10 }}
                        onClick={() => cambiarEstado(r.id_reservacion, 'cancelada')}
                      >
                        Cancelar reservación
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {usuarioActual?.rol === 'admin' && (
          <>
            <h2>Panel de reservaciones (admin)</h2>
            {todas.length === 0 ? (
              <p>No hay reservaciones todavía.</p>
            ) : (
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Cliente</th>
                      <th>Restaurante</th>
                      <th>Fecha</th>
                      <th>Pedido</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todas.map((r) => (
                      <tr key={r.id_reservacion}>
                        <td>{r.id_reservacion}</td>
                        <td>{r.cliente}</td>
                        <td>{r.negocio}</td>
                        <td>
                          {r.fecha} {r.hora.slice(0, 5)}
                          <br />
                          {r.personas} personas
                        </td>
                        <td>
                          {r.platillos.map((p) => `${p.cantidad} x ${p.nombre}`).join(', ') || '-'}
                        </td>
                        <td>${Number(r.total).toFixed(2)}</td>
                        <td>
                          <span className={`insignia estado-${r.estado}`}>{r.estado}</span>
                        </td>
                        <td className="acciones">
                          {r.estado === 'pendiente' && (
                            <button onClick={() => cambiarEstado(r.id_reservacion, 'confirmada')}>
                              Confirmar
                            </button>
                          )}
                          {r.estado !== 'cancelada' && (
                            <button
                              className="secundario"
                              onClick={() => cambiarEstado(r.id_reservacion, 'cancelada')}
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2>Usuarios (solo admin)</h2>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id_usuario}>
                      <td>{u.id_usuario}</td>
                      <td>{u.nombre}</td>
                      <td>{u.correo}</td>
                      <td>{u.rol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {rutaAbierta && (
        <VentanaRuta
          ruta={rutaAbierta}
          onCerrar={() => setRutaAbierta(null)}
          onAbrirNegocio={(nombre) => {
            const n = negocios.find((x) => x.nombre === nombre);
            if (n) setNegocioAbierto(n);
          }}
        />
      )}

      {negocioAbierto && (
        <VentanaNegocio
          negocio={negocioAbierto}
          usuario={usuarioActual}
          onCerrar={() => setNegocioAbierto(null)}
          onReservado={() => cargarReservaciones(usuarioActual)}
        />
      )}
    </>
  );
}

export default App;
