#!/bin/bash
set -e

# ============================================================
#  GestãoPro - Setup Completo (Multi-Tenant / VPS 2GB)
#
#  O que este script faz:
#    1. Verifica dependências (Docker, Node.js, Nginx)
#    2. Garante swap de 2GB
#    3. Reseta e configura Supabase (compose otimizado - 5 containers)
#    4. Gera todas as chaves (JWT, ANON, SERVICE_ROLE, ENCRYPTION)
#    5. Aplica migrations do banco
#    6. Deploy das Edge Functions
#    7. Cria Super Admin
#    8. Compila o frontend
#    9. Configura Nginx
#
#  Uso:
#    chmod +x setup.sh
#    sudo ./setup.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  GestãoPro - Setup Multi-Tenant (VPS 2GB)       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step()    { echo ""; echo -e "${GREEN}▶ $1${NC}"; echo "────────────────────────────────────────"; }
print_warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error()   { echo -e "${RED}✖ $1${NC}"; }
print_success() { echo -e "${GREEN}✔ $1${NC}"; }

# ============================================================
# PRE-FLIGHT
# ============================================================
if [ "$EUID" -ne 0 ]; then
  print_error "Execute como root: sudo ./setup.sh"
  exit 1
fi

print_banner

# ============================================================
# DETECTAR CAMINHOS EXISTENTES
# ============================================================
SUPABASE_DIR="/opt/gestaopro/supabase-docker"
REPO_DIR=""
BACKUP_DIR="/opt/gestaopro/backups"

if [ -d "/root/gestorv2/client-connect-pro/src" ]; then
  REPO_DIR="/root/gestorv2/client-connect-pro"
elif [ -d "/opt/gestaopro/app/src" ]; then
  REPO_DIR="/opt/gestaopro/app"
else
  print_error "Repositório do app não encontrado!"
  print_error "Esperado em /root/gestorv2/client-connect-pro ou /opt/gestaopro/app"
  read -p "Informe o caminho completo do repositório: " REPO_DIR
  if [ ! -d "$REPO_DIR/src" ]; then
    print_error "Caminho inválido (não encontrou /src). Abortando."
    exit 1
  fi
fi

echo -e "  App:      ${CYAN}$REPO_DIR${NC}"
echo -e "  Supabase: ${CYAN}$SUPABASE_DIR${NC}"

mkdir -p "$BACKUP_DIR"

# ============================================================
# CONFIGURAÇÕES INTERATIVAS
# ============================================================
print_step "Configuração inicial"

CURRENT_IP=$(hostname -I | awk '{print $1}')
read -p "Domínio ou IP público da VPS [$CURRENT_IP]: " DOMAIN
DOMAIN=${DOMAIN:-$CURRENT_IP}

read -p "Porta para o frontend [4060]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-4060}

read -sp "Senha do banco PostgreSQL (vazio = gerar automática): " DB_PASSWORD
echo ""
if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD=$(openssl rand -hex 16)
  print_warn "Senha gerada: $DB_PASSWORD"
fi

read -p "ENCRYPTION_KEY AES-256 (vazio = gerar automática): " ENCRYPTION_KEY
if [ -z "$ENCRYPTION_KEY" ]; then
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  print_warn "Chave gerada: $ENCRYPTION_KEY"
fi

echo ""
read -p "E-mail do Super Admin: " ADMIN_EMAIL
read -sp "Senha do Super Admin (mín. 6 caracteres): " ADMIN_PASSWORD
echo ""
if [ ${#ADMIN_PASSWORD} -lt 6 ]; then
  print_error "Senha deve ter no mínimo 6 caracteres"
  exit 1
fi

echo ""
echo -e "${YELLOW}═══ RESUMO ═══${NC}"
echo -e "  Domínio/IP:    $DOMAIN"
echo -e "  Frontend:      http://$DOMAIN:$FRONTEND_PORT"
echo -e "  Supabase API:  http://$DOMAIN:8000"
echo -e "  Super Admin:   $ADMIN_EMAIL"
echo ""
read -p "Confirma? (s/n): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
  echo "Cancelado."
  exit 0
fi

# ============================================================
# 1. VERIFICAR DEPENDÊNCIAS
# ============================================================
print_step "1/9 - Verificando dependências"

if ! command -v docker &> /dev/null; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  print_success "Docker instalado"
else
  print_success "Docker já instalado: $(docker --version | head -1)"
fi

if ! docker compose version &> /dev/null; then
  echo "Instalando Docker Compose plugin..."
  apt-get update -qq
  apt-get install -y -qq docker-compose-plugin
  print_success "Docker Compose instalado"
else
  print_success "Docker Compose já instalado"
fi

if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
  echo "Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  print_success "Node.js instalado: $(node -v)"
else
  print_success "Node.js já instalado: $(node -v)"
fi

if ! command -v nginx &> /dev/null; then
  echo "Instalando Nginx..."
  apt-get update -qq
  apt-get install -y -qq nginx
  systemctl enable nginx
  print_success "Nginx instalado"
else
  print_success "Nginx já instalado"
fi

apt-get install -y -qq jq openssl curl > /dev/null 2>&1 || true

# ============================================================
# 2. GARANTIR SWAP DE 2GB
# ============================================================
print_step "2/9 - Verificando swap"

if [ "$(swapon --show | wc -l)" -lt 2 ]; then
  echo "Criando swap de 2GB..."
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  print_success "Swap de 2GB criado"
else
  print_success "Swap já existe: $(free -h | grep Swap | awk '{print $2}')"
fi

# ============================================================
# 3. PARAR SUPABASE EXISTENTE E RESETAR
# ============================================================
print_step "3/9 - Configurando Supabase"

if [ -d "$SUPABASE_DIR" ]; then
  echo "Parando Supabase existente..."
  cd "$SUPABASE_DIR"
  docker compose down -v 2>/dev/null || true
  rm -rf "$SUPABASE_DIR/volumes/db/data"
  print_warn "Banco resetado (volumes limpos)"
fi

if [ ! -d "$SUPABASE_DIR" ]; then
  echo "Baixando Supabase Docker..."
  git clone --depth 1 https://github.com/supabase/supabase.git "/tmp/supabase-tmp"
  mkdir -p "$(dirname $SUPABASE_DIR)"
  mv "/tmp/supabase-tmp/docker" "$SUPABASE_DIR"
  rm -rf "/tmp/supabase-tmp"
fi

cd "$SUPABASE_DIR"

JWT_SECRET=$(openssl rand -hex 32)
VAULT_ENC_KEY=$(openssl rand -hex 32)
SECRET_KEY_BASE=$(openssl rand -hex 64)
LOGFLARE_API_KEY=$(openssl rand -hex 32)
PG_META_CRYPTO_KEY=$(openssl rand -hex 32)

generate_jwt() {
  local role=$1
  local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 -w 0 | tr '+/' '-_' | tr -d '=')
  local payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$(date +%s),\"exp\":$(($(date +%s) + 315360000))}" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
  local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 -w 0 | tr '+/' '-_' | tr -d '=')
  echo "$header.$payload.$signature"
}

ANON_KEY=$(generate_jwt "anon")
SERVICE_ROLE_KEY=$(generate_jwt "service_role")

cat > .env << ENVFILE
POSTGRES_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$ADMIN_PASSWORD
VAULT_ENC_KEY=$VAULT_ENC_KEY
SECRET_KEY_BASE=$SECRET_KEY_BASE
PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
SITE_URL=http://$DOMAIN:$FRONTEND_PORT
API_EXTERNAL_URL=http://$DOMAIN:8000
SUPABASE_PUBLIC_URL=http://$DOMAIN:8000
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
JWT_EXPIRY=3600
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false
DISABLE_SIGNUP=false
ADDITIONAL_REDIRECT_URLS=
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
MAILER_URLPATHS_INVITE=/auth/v1/verify
SMTP_ADMIN_EMAIL=admin@localhost
SMTP_HOST=supabase-mail
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=GestãoPro
PGRST_DB_SCHEMAS=public,storage,graphql_public
SUPABASE_EDGE_RUNTIME_ENCRYPTION_KEY=$ENCRYPTION_KEY
FUNCTIONS_VERIFY_JWT=false
LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_API_KEY
LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_API_KEY
DOCKER_SOCKET_LOCATION=/var/run/docker.sock
ENVFILE

print_success "Chaves geradas e .env configurado"

echo "Aplicando docker-compose otimizado (5 containers)..."
cp -f docker-compose.yml docker-compose.yml.bak 2>/dev/null || true

cat > docker-compose.yml << 'COMPOSEFILE'
name: supabase

services:

  kong:
    container_name: supabase-kong
    image: kong:2.8.1
    restart: unless-stopped
    ports:
      - ${KONG_HTTP_PORT}:8000/tcp
      - ${KONG_HTTPS_PORT}:8443/tcp
    volumes:
      - ./volumes/api/kong.yml:/home/kong/temp.yml:ro,z
    depends_on:
      db:
        condition: service_healthy
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /home/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth,request-termination,ip-restriction
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      DASHBOARD_USERNAME: ${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: ${DASHBOARD_PASSWORD}
    entrypoint: bash -c 'eval "echo \"$$(cat ~/temp.yml)\"" > ~/kong.yml && /docker-entrypoint.sh kong docker-start'

  auth:
    container_name: supabase-auth
    image: supabase/gotrue:v2.186.0
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999/health"]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      db:
        condition: service_healthy
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: ${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: ${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: ${ENABLE_ANONYMOUS_USERS}
      GOTRUE_MAILER_AUTOCONFIRM: ${ENABLE_EMAIL_AUTOCONFIRM}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}
      GOTRUE_MAILER_URLPATHS_INVITE: ${MAILER_URLPATHS_INVITE}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: ${MAILER_URLPATHS_CONFIRMATION}
      GOTRUE_MAILER_URLPATHS_RECOVERY: ${MAILER_URLPATHS_RECOVERY}
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: ${MAILER_URLPATHS_EMAIL_CHANGE}
      GOTRUE_EXTERNAL_PHONE_ENABLED: ${ENABLE_PHONE_SIGNUP}
      GOTRUE_SMS_AUTOCONFIRM: ${ENABLE_PHONE_AUTOCONFIRM}

  rest:
    container_name: supabase-rest
    image: postgrest/postgrest:v14.5
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      PGRST_DB_SCHEMAS: ${PGRST_DB_SCHEMAS}
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: ${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: ${JWT_EXPIRY}
    command: ["postgrest"]

  functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.70.3
    restart: unless-stopped
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
      - deno-cache:/root/.cache/deno
    depends_on:
      db:
        condition: service_healthy
    environment:
      JWT_SECRET: ${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"
    command: ["start", "--main-service", "/home/deno/functions/main"]

  db:
    container_name: supabase-db
    image: supabase/postgres:15.8.1.085
    restart: unless-stopped
    volumes:
      - ./volumes/db/realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:Z
      - ./volumes/db/webhooks.sql:/docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql:Z
      - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z
      - ./volumes/db/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:Z
      - ./volumes/db/data:/var/lib/postgresql/data:Z
      - ./volumes/db/_supabase.sql:/docker-entrypoint-initdb.d/migrations/97-_supabase.sql:Z
      - ./volumes/db/logs.sql:/docker-entrypoint-initdb.d/migrations/99-logs.sql:Z
      - ./volumes/db/pooler.sql:/docker-entrypoint-initdb.d/migrations/99-pooler.sql:Z
      - db-config:/etc/postgresql-custom
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 10
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: ${POSTGRES_PORT}
      POSTGRES_PORT: ${POSTGRES_PORT}
      PGPASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: ${POSTGRES_DB}
      POSTGRES_DB: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXPIRY}
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf", "-c", "log_min_messages=fatal"]

volumes:
  db-config:
  deno-cache:
COMPOSEFILE

print_success "docker-compose otimizado aplicado"

# ============================================================
# 4. SUBIR SUPABASE
# ============================================================
print_step "4/9 - Iniciando Supabase (5 containers)"

docker compose up -d

echo "Aguardando banco inicializar (30s)..."
sleep 30

if docker compose ps 2>/dev/null | grep -qi "Up\|running\|healthy"; then
  print_success "Supabase rodando!"
else
  print_error "Erro ao iniciar. Verificando logs..."
  docker compose logs --tail=20
  exit 1
fi

SUPABASE_URL="http://localhost:8000"

# ============================================================
# 5. APLICAR MIGRATIONS
# ============================================================
print_step "5/9 - Aplicando migrations"

if [ -d "$REPO_DIR/supabase/migrations" ]; then
  for i in {1..20}; do
    if docker exec supabase-db pg_isready -U postgres -h localhost > /dev/null 2>&1; then
      break
    fi
    echo "Aguardando banco... ($i)"
    sleep 3
  done

  for migration in $(ls "$REPO_DIR/supabase/migrations"/*.sql 2>/dev/null | sort); do
    echo "  → $(basename $migration)"
    docker exec -i supabase-db psql -U postgres -d postgres < "$migration" 2>/dev/null || true
  done
  print_success "Migrations aplicadas"
else
  print_warn "Nenhuma migration encontrada em $REPO_DIR/supabase/migrations"
fi

# ============================================================
# 6. DEPLOY EDGE FUNCTIONS
# ============================================================
print_step "6/9 - Configurando Edge Functions"

FUNCTIONS_DIR="$SUPABASE_DIR/volumes/functions"
mkdir -p "$FUNCTIONS_DIR"

cat > "$FUNCTIONS_DIR/secrets.env" << EDGESECRETS
SUPABASE_URL=http://kong:8000
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=$ANON_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY
EDGESECRETS

if [ -d "$REPO_DIR/supabase/functions" ]; then
  for func_dir in "$REPO_DIR/supabase/functions"/*/; do
    if [ -d "$func_dir" ]; then
      func_name=$(basename "$func_dir")
      if [ "$func_name" != "_shared" ]; then
        cp -r "$func_dir" "$FUNCTIONS_DIR/$func_name"
        echo "  → $func_name"
      fi
    fi
  done

  if [ -d "$REPO_DIR/supabase/functions/_shared" ]; then
    cp -r "$REPO_DIR/supabase/functions/_shared" "$FUNCTIONS_DIR/_shared"
    echo "  → _shared (utils)"
  fi

  if [ -f "$REPO_DIR/supabase/functions/main/index.ts" ]; then
    mkdir -p "$FUNCTIONS_DIR/main"
    cp "$REPO_DIR/supabase/functions/main/index.ts" "$FUNCTIONS_DIR/main/"
  fi

  docker compose restart functions 2>/dev/null || true
  print_success "Edge Functions deployadas"
else
  print_warn "Nenhuma edge function encontrada"
fi

# ============================================================
# 7. CRIAR SUPER ADMIN
# ============================================================
print_step "7/9 - Criando Super Admin"

echo "Aguardando API ficar disponível..."
for i in {1..30}; do
  if curl -sf "$SUPABASE_URL/rest/v1/" -H "apikey: $ANON_KEY" > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# O trigger handle_new_user() lê role do user_metadata e cria tudo automaticamente
echo "Criando Super Admin via API..."
CREATE_RESULT=$(curl -sf -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"Super Admin\",\"role\":\"super_admin\"}}" 2>&1)

if echo "$CREATE_RESULT" | jq -e '.id' > /dev/null 2>&1; then
  echo "Usuário criado, trigger configurando role super_admin..."
else
  print_warn "Resposta da API: $CREATE_RESULT"
fi

sleep 3

USER_ID=$(curl -sf "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" | jq -r ".users[] | select(.email==\"$ADMIN_EMAIL\") | .id" 2>/dev/null)

if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
  echo "User ID: $USER_ID"
  print_success "Super Admin criado: $ADMIN_EMAIL (role: super_admin)"
else
  print_error "Não foi possível obter o user_id. Verifique se a API está respondendo:"
  print_error "  curl http://localhost:8000/auth/v1/admin/users -H 'apikey: SERVICE_ROLE_KEY' -H 'Authorization: Bearer SERVICE_ROLE_KEY'"
fi

# ============================================================
# 8. COMPILAR FRONTEND
# ============================================================
print_step "8/9 - Compilando frontend"

cd "$REPO_DIR"

cat > .env << FRONTENV
VITE_SUPABASE_URL=http://$DOMAIN:8000
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=self-hosted
FRONTENV

print_success ".env do frontend configurado"

echo "Instalando dependências (pode demorar)..."
npm install --legacy-peer-deps

echo "Compilando..."
npm run build

if [ -d "dist" ] && [ -f "dist/index.html" ]; then
  print_success "Frontend compilado em $REPO_DIR/dist"
else
  print_error "Erro na compilação!"
  print_error "Tente manualmente: cd $REPO_DIR && npm run build"
  exit 1
fi

# ============================================================
# 9. CONFIGURAR NGINX
# ============================================================
print_step "9/9 - Configurando Nginx"

cat > /etc/nginx/sites-available/gestaopro << NGINXCONF
server {
    listen $FRONTEND_PORT;
    server_name $DOMAIN;

    root $REPO_DIR/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /rest/ {
        proxy_pass http://localhost:8000/rest/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /auth/ {
        proxy_pass http://localhost:8000/auth/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /functions/ {
        proxy_pass http://localhost:8000/functions/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/gestaopro /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>/dev/null; then
  chmod 755 /root
  chmod -R 755 "$REPO_DIR/dist"
  systemctl reload nginx
  print_success "Nginx configurado na porta $FRONTEND_PORT"
else
  print_error "Erro na configuração do Nginx"
  nginx -t
  exit 1
fi

# ============================================================
# SALVAR BACKUP DAS CHAVES
# ============================================================
KEYS_FILE="$BACKUP_DIR/keys-$(date +%Y%m%d-%H%M%S).txt"
cat > "$KEYS_FILE" << KEYSBACKUP
╔══════════════════════════════════════════════════╗
║  GestãoPro - Chaves de Segurança                ║
║  Gerado em: $(date)                             ║
║                                                  ║
║  ⚠️  GUARDE EM LOCAL SEGURO!                     ║
╚══════════════════════════════════════════════════╝

── Banco de Dados ──
POSTGRES_PASSWORD=$DB_PASSWORD

── JWT ──
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

── Criptografia ──
ENCRYPTION_KEY=$ENCRYPTION_KEY

── Super Admin ──
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

── URLs ──
FRONTEND: http://$DOMAIN:$FRONTEND_PORT
SUPABASE API: http://$DOMAIN:8000
SUPER ADMIN: http://$DOMAIN:$FRONTEND_PORT/super-admin
ADMIN LOGIN: http://$DOMAIN:$FRONTEND_PORT/admin/login
USER LOGIN:  http://$DOMAIN:$FRONTEND_PORT/auth

── Diretórios ──
App: $REPO_DIR
Supabase: $SUPABASE_DIR
Backups: $BACKUP_DIR
KEYSBACKUP

chmod 600 "$KEYS_FILE"

# ============================================================
# RESUMO FINAL
# ============================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         ✅ INSTALAÇÃO CONCLUÍDA!                 ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}🌐 Frontend:${NC}       http://$DOMAIN:$FRONTEND_PORT"
echo -e "  ${GREEN}🔌 API Supabase:${NC}   http://$DOMAIN:8000"
echo ""
echo -e "  ${GREEN}👤 Super Admin:${NC}    $ADMIN_EMAIL"
echo -e "  ${GREEN}🔐 Super Admin:${NC}    http://$DOMAIN:$FRONTEND_PORT/super-admin"
echo -e "  ${GREEN}🔐 Admin Login:${NC}    http://$DOMAIN:$FRONTEND_PORT/admin/login"
echo -e "  ${GREEN}🔐 User Login:${NC}     http://$DOMAIN:$FRONTEND_PORT/auth"
echo ""
echo -e "  ${YELLOW}📁 Backup chaves:${NC}  $KEYS_FILE"
echo -e "  ${YELLOW}⚠️  GUARDE O ARQUIVO DE BACKUP EM LOCAL SEGURO!${NC}"
echo ""
echo -e "  ${CYAN}Containers rodando:${NC}"
docker stats --no-stream --format "    {{.Name}}: {{.MemUsage}}" 2>/dev/null | grep supabase || true
echo ""
echo -e "  ${CYAN}RAM disponível:${NC}"
free -h | grep Mem | awk '{print "    Total: "$2"  Usado: "$3"  Livre: "$7}'
echo ""
echo -e "  ${CYAN}Comandos úteis:${NC}"
echo -e "    Logs:       cd $SUPABASE_DIR && docker compose logs -f"
echo -e "    Restart:    cd $SUPABASE_DIR && docker compose restart"
echo -e "    Status:     docker stats --no-stream"
echo -e "    Rebuild:    cd $REPO_DIR && npm run build && systemctl reload nginx"
echo ""