#!/bin/bash
# =====================================================================
# Despliegue de "Rutas gastronómicas" en UNA instancia EC2 con Ubuntu 24.04
# PostgreSQL 18 + PostGIS, backend Node (servicio) y frontend con nginx.
#
# Antes de ejecutarlo, en el home de la instancia (/home/ubuntu) debe haber:
#   app/backend/    (sin node_modules)
#   app/frontend/   (sin node_modules ni dist)
#   respaldo_rutas.sql   (el respaldo hecho con pg_dump)
#
# Uso:  DB_PASS=tu_contraseña bash desplegar_aws.sh
# =====================================================================
set -e

: "${DB_PASS:?Falta DB_PASS. Usa: DB_PASS=tu_contraseña bash desplegar_aws.sh}"
APP=/home/ubuntu/app

# Comprobaciones rápidas
[ -d "$APP/backend" ]  || { echo "Falta $APP/backend";  exit 1; }
[ -d "$APP/frontend" ] || { echo "Falta $APP/frontend"; exit 1; }
[ -f /home/ubuntu/respaldo_rutas.sql ] || { echo "Falta respaldo_rutas.sql"; exit 1; }
grep -q "VITE_API_URL" "$APP/frontend/src/App.jsx" || { echo "App.jsx no usa VITE_API_URL"; exit 1; }

echo "==> 1. Paquetes base"
sudo apt-get update
sudo apt-get install -y nginx curl build-essential python3 postgresql-common

echo "==> 2. Node.js 22"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> 3. PostgreSQL 18 + PostGIS (repositorio oficial PGDG)"
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y postgresql-18 postgresql-18-postgis-3

echo "==> 4. Base de datos"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='rutas_gastronomicas'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE rutas_gastronomicas;"
sudo -u postgres psql -d rutas_gastronomicas -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d rutas_gastronomicas -f /home/ubuntu/respaldo_rutas.sql || true

echo "==> 5. Backend"
cd "$APP/backend"
npm install --omit=dev
cat > .env <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rutas_gastronomicas
DB_USER=postgres
DB_PASSWORD=$DB_PASS
JWT_SECRET=$(openssl rand -hex 32)
N8N_WEBHOOK_URL=http://localhost:5678/webhook/reservaciones
EOF

sudo tee /etc/systemd/system/rutas-backend.service > /dev/null <<EOF
[Unit]
Description=Backend Rutas Gastronomicas
After=network.target postgresql.service

[Service]
WorkingDirectory=$APP/backend
ExecStart=/usr/bin/node server.js
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable rutas-backend
sudo systemctl restart rutas-backend

echo "==> 6. Frontend (compilado con la API en /api)"
cd "$APP/frontend"
npm install
VITE_API_URL=/api npm run build
sudo rm -rf /var/www/rutas
sudo mkdir -p /var/www/rutas
sudo cp -r dist/* /var/www/rutas/

echo "==> 7. nginx"
sudo tee /etc/nginx/sites-available/rutas > /dev/null <<'EOF'
server {
    listen 80 default_server;
    root /var/www/rutas;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/rutas /etc/nginx/sites-enabled/rutas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "Listo. Abre en el navegador:  http://IP_PUBLICA_DE_LA_INSTANCIA"
echo "Estado del backend: sudo systemctl status rutas-backend"
