const Database = require('./database');

const a = Database.getInstance();
const b = Database.getInstance();
const c = new Database();

console.log('a === b:', a === b);
console.log('a === c (incluso con new):', a === c);
console.log('mismo pool de conexiones:', a.pool === b.pool);

a.query('SELECT COUNT(*) AS total FROM usuarios')
  .then((r) => {
    console.log('Usuarios en la base de datos:', r.rows[0].total);
    return a.pool.end();
  })
  .catch((err) => console.error('Error:', err.message));