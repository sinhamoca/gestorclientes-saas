#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  GestãoPro - Painel de Instalação e Configuração
#
#  Script unificado com menu interativo:
#    1. Instalação completa (VPS do zero)
#    2. Configuração de domínio (Cloudflare)
#    3. Ativar cron de lembretes automáticos
#    4. Status do sistema
#
#  Uso:
#    chmod +x gestaopro.sh
#    sudo ./gestaopro.sh
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Cores ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Helpers ───
print_step()    { echo ""; echo -e "${GREEN}▶ $1${NC}"; echo "────────────────────────────────────────"; }
print_warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error()   { echo -e "${RED}✖ $1${NC}"; }
print_success() { echo -e "${GREEN}✔ $1${NC}"; }
log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✖]${NC} $1"; exit 1; }

# ─── Paths ───
SUPABASE_DIR="/opt/gestaopro/supabase-docker"
BACKUP_DIR="/opt/gestaopro/backups"

detect_repo() {
  if [ -d "/root/gestorv2/client-connect-pro/src" ]; then
    REPO_DIR="/root/gestorv2/client-connect-pro"
  elif [ -d "/opt/gestaopro/app/src" ]; then
    REPO_DIR="/opt/gestaopro/app"
  else
    REPO_DIR=""
  fi
}

detect_repo

# ─── Root check ───
if [ "$EUID" -ne 0 ]; then
  print_error "Execute como root: sudo ./gestaopro.sh"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
#  MENU PRINCIPAL
# ═══════════════════════════════════════════════════════════════
show_menu() {
  clear
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}║     ${BOLD}GestãoPro${NC}${CYAN} - Painel de Gerenciamento             ║${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}║  ${GREEN}1)${NC}${CYAN}  🚀  Instalação Completa                        ║${NC}"
  echo -e "${CYAN}║       ${DIM}Setup do zero: Docker, Supabase, Frontend${NC}${CYAN}     ║${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}║  ${GREEN}2)${NC}${CYAN}  🌐  Configurar Domínio                         ║${NC}"
  echo -e "${CYAN}║       ${DIM}Nginx + Cloudflare SSL + Rebuild${NC}${CYAN}               ║${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}║  ${GREEN}3)${NC}${CYAN}  ⏰  Ativar Lembretes Automáticos                ║${NC}"
  echo -e "${CYAN}║       ${DIM}Cron a cada minuto + envio WhatsApp${NC}${CYAN}            ║${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}║  ${GREEN}4)${NC}${CYAN}  📊  Status do Sistema                           ║${NC}"
  echo -e "${CYAN}║       ${DIM}Containers, RAM, Cron, Logs${NC}${CYAN}                    ║${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}║  ${GREEN}0)${NC}${CYAN}  ❌  Sair                                        ║${NC}"
  echo -e "${CYAN}║                                                      ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -ne "  ${BOLD}Escolha uma opção [0-4]:${NC} "
}

# ═══════════════════════════════════════════════════════════════
#  OPÇÃO 1: INSTALAÇÃO COMPLETA
# ═══════════════════════════════════════════════════════════════
do_full_install() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  🚀 Instalação Completa - GestãoPro             ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  # Detectar repo
  detect_repo
  if [ -z "$REPO_DIR" ]; then
    print_error "Repositório do app não encontrado!"
    print_error "Esperado em /root/gestorv2/client-connect-pro ou /opt/gestaopro/app"
    read -p "Informe o caminho completo do repositório: " REPO_DIR
    if [ ! -d "$REPO_DIR/src" ]; then
      print_error "Caminho inválido (não encontrou /src). Abortando."
      return 1
    fi
  fi

  echo -e "  App:      ${CYAN}$REPO_DIR${NC}"
  echo -e "  Supabase: ${CYAN}$SUPABASE_DIR${NC}"
  echo ""
  mkdir -p "$BACKUP_DIR"

  # ── Configurações interativas ──
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
    return 1
  fi

  echo ""
  echo -e "${YELLOW}═══ RESUMO ═══${NC}"
  echo -e "  Domínio/IP:    $DOMAIN"
  echo -e "  Frontend:      http://$DOMAIN:$FRONTEND_PORT"
  echo -e "  Supabase API:  http://$DOMAIN:8000"
  echo -e "  Admin:         $ADMIN_EMAIL (Super Admin)"
  echo ""
  read -p "Confirma? (s/n): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
    echo "Cancelado."
    return 0
  fi

  # ── 1/10: Dependências ──
  print_step "1/10 - Verificando dependências"

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

  # ── 2/10: Swap ──
  print_step "2/10 - Verificando swap"

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

  # ── 3/10: Supabase ──
  print_step "3/10 - Configurando Supabase"

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
############
# Secrets
############
POSTGRES_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$ADMIN_PASSWORD
VAULT_ENC_KEY=$VAULT_ENC_KEY
SECRET_KEY_BASE=$SECRET_KEY_BASE
PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY

############
# Database
############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############
# API
############
SITE_URL=http://$DOMAIN:$FRONTEND_PORT
API_EXTERNAL_URL=http://$DOMAIN:8000
SUPABASE_PUBLIC_URL=http://$DOMAIN:8000

############
# Kong
############
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

############
# Auth (GoTrue)
############
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

############
# PostgREST
############
PGRST_DB_SCHEMAS=public,storage,graphql_public

############
# Edge Functions
############
SUPABASE_EDGE_RUNTIME_ENCRYPTION_KEY=$ENCRYPTION_KEY
FUNCTIONS_VERIFY_JWT=false

############
# Logflare
############
LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_API_KEY
LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_API_KEY

############
# Docker
############
DOCKER_SOCKET_LOCATION=/var/run/docker.sock
ENVFILE

  print_success "Chaves geradas e .env configurado"

  # Docker Compose otimizado
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

  # ── 4/10: Subir Supabase ──
  print_step "4/10 - Iniciando Supabase (5 containers)"

  docker compose up -d
  echo "Aguardando banco inicializar (30s)..."
  sleep 30

  if docker compose ps 2>/dev/null | grep -qi "Up\|running\|healthy"; then
    print_success "Supabase rodando!"
  else
    print_error "Erro ao iniciar. Verificando logs..."
    docker compose logs --tail=20
    return 1
  fi

  SUPABASE_URL="http://localhost:8000"

  # ── 5/10: Migrations ──
  print_step "5/10 - Aplicando migrations"

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

  # ── 6/10: Edge Functions ──
  print_step "6/10 - Configurando Edge Functions"

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

  # ── 7/10: Super Admin ──
  print_step "7/10 - Criando Super Admin"

  echo "Aguardando API ficar disponível..."
  for i in {1..30}; do
    if curl -sf "$SUPABASE_URL/rest/v1/" -H "apikey: $ANON_KEY" > /dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  echo "Criando Super Admin via API..."
  CREATE_RESULT=$(curl -sf -X POST "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"Super Admin\",\"role\":\"super_admin\"}}" 2>&1)

  if echo "$CREATE_RESULT" | jq -e '.id' > /dev/null 2>&1; then
    echo "Usuário criado, trigger atribuiu role super_admin automaticamente..."
  else
    print_warn "Resposta da API: $CREATE_RESULT"
  fi

  # Aguardar trigger processar
  sleep 3

  USER_ID=$(curl -sf "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" | jq -r ".users[] | select(.email==\"$ADMIN_EMAIL\") | .id" 2>/dev/null)

  if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
    echo "User ID: $USER_ID"

    # Verificar se trigger criou a role corretamente
    ROLE_CHECK=$(docker exec supabase-db psql -U postgres -d postgres -t -c \
      "SELECT role FROM user_roles WHERE user_id = '$USER_ID';" 2>/dev/null | tr -d ' ')

    if echo "$ROLE_CHECK" | grep -q "super_admin"; then
      print_success "Super Admin criado: $ADMIN_EMAIL (role: super_admin)"
    else
      # Fallback: corrigir manualmente se trigger não funcionou
      print_warn "Trigger não atribuiu super_admin, corrigindo manualmente..."
      docker exec supabase-db psql -U postgres -d postgres -c "
        DELETE FROM user_roles WHERE user_id = '$USER_ID';
        INSERT INTO user_roles (user_id, role) VALUES ('$USER_ID', 'super_admin');
        UPDATE profiles SET subscription_end = '2099-12-31T23:59:59Z', is_active = true WHERE user_id = '$USER_ID';
      " > /dev/null 2>&1
      print_success "Super Admin criado: $ADMIN_EMAIL (role: super_admin, corrigido)"
    fi
  else
    print_error "Não foi possível obter o user_id. Verifique a API manualmente."
  fi

  # ── 8/10: Frontend ──
  print_step "8/10 - Compilando frontend"

  cd "$REPO_DIR"

  cat > .env << FRONTENV
VITE_SUPABASE_URL=http://$DOMAIN:8000
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=self-hosted
FRONTENV

  print_success ".env do frontend configurado"

  echo "Instalando dependências..."
  npm install --legacy-peer-deps

  echo "Compilando..."
  npm run build

  if [ -d "dist" ] && [ -f "dist/index.html" ]; then
    print_success "Frontend compilado"
  else
    print_error "Erro na compilação!"
    return 1
  fi

  # ── 9/10: Nginx ──
  print_step "9/10 - Configurando Nginx"

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
        proxy_connect_timeout 60s;
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
    return 1
  fi

  # ── 10/10: Cron de Lembretes ──
  print_step "10/10 - Configurando Cron de Lembretes"

  setup_reminders_cron
  print_success "Lembretes automáticos configurados"

  # ── Backup de chaves ──
  KEYS_FILE="$BACKUP_DIR/keys-$(date +%Y%m%d-%H%M%S).txt"
  cat > "$KEYS_FILE" << KEYSBACKUP
╔══════════════════════════════════════════════════╗
║  GestãoPro - Chaves de Segurança                ║
║  Gerado em: $(date)                             ║
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
ADMIN PANEL: http://$DOMAIN:$FRONTEND_PORT/admin
USER LOGIN:  http://$DOMAIN:$FRONTEND_PORT/auth

── Diretórios ──
App: $REPO_DIR
Supabase: $SUPABASE_DIR
Backups: $BACKUP_DIR
KEYSBACKUP

  chmod 600 "$KEYS_FILE"

  # ── Resumo ──
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║         ✅ INSTALAÇÃO CONCLUÍDA!                 ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${GREEN}🌐 Frontend:${NC}       http://$DOMAIN:$FRONTEND_PORT"
  echo -e "  ${GREEN}🔌 API Supabase:${NC}   http://$DOMAIN:8000"
  echo -e "  ${GREEN}👑 Super Admin:${NC}    http://$DOMAIN:$FRONTEND_PORT/super-admin"
  echo -e "  ${GREEN}🔐 Admin Panel:${NC}    http://$DOMAIN:$FRONTEND_PORT/admin"
  echo -e "  ${GREEN}👤 User Login:${NC}     http://$DOMAIN:$FRONTEND_PORT/auth"
  echo -e "  ${GREEN}📧 Super Admin:${NC}    $ADMIN_EMAIL"
  echo -e "  ${GREEN}⏰ Lembretes:${NC}      Cron ativo (a cada minuto)"
  echo ""
  echo -e "  ${YELLOW}📁 Backup chaves:${NC}  $KEYS_FILE"
  echo -e "  ${YELLOW}⚠️  GUARDE O ARQUIVO DE BACKUP EM LOCAL SEGURO!${NC}"
  echo ""
  echo -e "  ${CYAN}Containers rodando:${NC}"
  docker stats --no-stream --format "    {{.Name}}: {{.MemUsage}}" 2>/dev/null | grep supabase || true
  echo ""
  echo -e "  ${CYAN}Comandos úteis:${NC}"
  echo -e "    Logs:       cd $SUPABASE_DIR && docker compose logs -f"
  echo -e "    Restart:    cd $SUPABASE_DIR && docker compose restart"
  echo -e "    Status:     sudo ./gestaopro.sh → opção 4"
  echo -e "    Domínio:    sudo ./gestaopro.sh → opção 2"
  echo ""
}

# ═══════════════════════════════════════════════════════════════
#  OPÇÃO 2: CONFIGURAR DOMÍNIO
# ═══════════════════════════════════════════════════════════════
do_setup_domain() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  🌐 Configuração de Domínio                     ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  detect_repo
  if [ -z "$REPO_DIR" ]; then
    err "Diretório do projeto não encontrado. Execute a instalação primeiro."
  fi

  ENV_FILE="$SUPABASE_DIR/.env"
  DIST_DIR="$REPO_DIR/dist"

  [ -f "$ENV_FILE" ] || err "Arquivo .env do Supabase não encontrado: $ENV_FILE"
  [ -d "$DIST_DIR" ] || err "Frontend não compilado. Execute: cd $REPO_DIR && npm run build"

  # ── Coletar informações ──
  read -p "Domínio (ex: gestao.seusite.com): " DOMAIN
  [ -z "$DOMAIN" ] && err "Domínio não pode ser vazio"

  CURRENT_PORT=$(grep -oP 'listen\s+\K[0-9]+' /etc/nginx/sites-enabled/gestaopro 2>/dev/null | head -1)
  CURRENT_PORT=${CURRENT_PORT:-4010}
  read -p "Porta interna do app [${CURRENT_PORT}]: " APP_PORT
  APP_PORT=${APP_PORT:-$CURRENT_PORT}

  SUPABASE_PORT=$(grep '^KONG_HTTP_PORT=' "$ENV_FILE" | cut -d'=' -f2)
  SUPABASE_PORT=${SUPABASE_PORT:-8000}

  PUBLIC_URL="https://${DOMAIN}"

  echo ""
  echo -e "  Domínio:        ${GREEN}${DOMAIN}${NC}"
  echo -e "  URL pública:    ${GREEN}${PUBLIC_URL}${NC}"
  echo -e "  Porta do app:   ${GREEN}${APP_PORT}${NC}"
  echo -e "  Porta Supabase: ${GREEN}${SUPABASE_PORT}${NC}"
  echo ""
  read -p "Confirmar? (s/n): " CONFIRM
  [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]] && err "Cancelado"

  # ── 1/5: Nginx ──
  print_step "1/5 - Configurando Nginx"

  cat > /etc/nginx/sites-available/gestaopro-domain << NGINXEOF
# GestãoPro - Domínio com Cloudflare SSL
server {
    listen 80;
    server_name ${DOMAIN};

    root ${DIST_DIR};
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:${SUPABASE_PORT}/auth/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    location /rest/v1/ {
        proxy_pass http://127.0.0.1:${SUPABASE_PORT}/rest/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    location /functions/v1/ {
        proxy_pass http://127.0.0.1:${SUPABASE_PORT}/functions/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }

    location /storage/v1/ {
        proxy_pass http://127.0.0.1:${SUPABASE_PORT}/storage/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /realtime/v1/ {
        proxy_pass http://127.0.0.1:${SUPABASE_PORT}/realtime/v1/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXEOF

  ln -sf /etc/nginx/sites-available/gestaopro-domain /etc/nginx/sites-enabled/gestaopro-domain
  nginx -t || err "Configuração do Nginx inválida"
  log "Nginx configurado para ${DOMAIN}"

  # ── 2/5: Frontend .env ──
  print_step "2/5 - Atualizando frontend"

  ANON_KEY=$(grep '^ANON_KEY=' "$ENV_FILE" | cut -d'=' -f2)

  cat > "$REPO_DIR/.env" << ENVEOF
VITE_SUPABASE_URL=${PUBLIC_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
ENVEOF

  log "Frontend .env atualizado com URL: ${PUBLIC_URL}"

  # ── 3/5: Rebuild ──
  print_step "3/5 - Recompilando frontend"

  cd "$REPO_DIR"
  npm run build 2>&1 | tail -5

  if [ -f "dist/index.html" ]; then
    chmod -R 755 dist/
    log "Frontend compilado"
  else
    err "Falha na compilação do frontend"
  fi

  # ── 4/5: Banco ──
  print_step "4/5 - Atualizando configurações no banco"

  # system_settings agora é per-admin (user_id, key), atualizar para todos os admins
  docker exec supabase-db psql -U postgres -d postgres -c \
    "INSERT INTO system_settings (user_id, key, value)
     SELECT ur.user_id, 'app_url', '${PUBLIC_URL}'
     FROM user_roles ur
     WHERE ur.role IN ('super_admin', 'admin')
     ON CONFLICT (user_id, key) DO UPDATE SET value = '${PUBLIC_URL}';" \
    > /dev/null 2>&1

  log "app_url atualizado para ${PUBLIC_URL} (todos os admins)"

  # ── 5/5: Reiniciar ──
  print_step "5/5 - Reiniciando serviços"

  systemctl reload nginx
  log "Nginx recarregado"

  docker restart supabase-edge-functions > /dev/null 2>&1
  log "Edge functions reiniciadas"

  # ── Verificação ──
  print_step "Verificação"

  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:80" -H "Host: ${DOMAIN}" | grep -q "200"; then
    log "Nginx respondendo na porta 80"
  else
    warn "Nginx pode não estar respondendo (normal se Cloudflare ainda não propagou)"
  fi

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/rest/v1/" -H "Host: ${DOMAIN}" -H "apikey: ${ANON_KEY}")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    log "Proxy Supabase funcionando"
  else
    warn "Proxy Supabase retornou HTTP ${HTTP_CODE}"
  fi

  # ── Resumo ──
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ Domínio configurado com sucesso!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  URL:  ${GREEN}${PUBLIC_URL}${NC}"
  echo ""
  echo -e "  ${CYAN}Painéis:${NC}"
  echo -e "    Super Admin: ${GREEN}${PUBLIC_URL}/super-admin${NC}"
  echo -e "    Admin Panel: ${GREEN}${PUBLIC_URL}/admin${NC}"
  echo -e "    User Login:  ${GREEN}${PUBLIC_URL}/auth${NC}"
  echo ""
  echo -e "  ${YELLOW}Próximos passos no Cloudflare:${NC}"
  echo ""
  echo -e "  1. Acesse: ${BLUE}https://dash.cloudflare.com${NC}"
  echo -e "  2. Selecione seu domínio"
  echo -e "  3. Vá em ${YELLOW}DNS → Records${NC}"
  echo -e "  4. Adicione um registro:"
  echo -e "     Tipo: ${GREEN}A${NC}"
  echo -e "     Nome: ${GREEN}${DOMAIN%%.*}${NC} (ou @ se for domínio raiz)"
  echo -e "     IPv4: ${GREEN}$(curl -s ifconfig.me 2>/dev/null || echo "SEU_IP")${NC}"
  echo -e "     Proxy: ${GREEN}Ativado (nuvem laranja)${NC}"
  echo ""
  echo -e "  5. Vá em ${YELLOW}SSL/TLS${NC}"
  echo -e "     Modo: ${GREEN}Flexible${NC} (ou Full se preferir)"
  echo ""
}

# ═══════════════════════════════════════════════════════════════
#  OPÇÃO 3: CRON DE LEMBRETES (também chamado internamente na opção 1)
# ═══════════════════════════════════════════════════════════════
setup_reminders_cron() {
  # Função reutilizável (chamada pela opção 1 e pela opção 3)

  if [ ! -f "$SUPABASE_DIR/.env" ]; then
    print_error "Supabase não encontrado em $SUPABASE_DIR. Execute a instalação primeiro."
    return 1
  fi

  SERVICE_ROLE_KEY=$(grep -E "^SERVICE_ROLE_KEY=" "$SUPABASE_DIR/.env" | cut -d'=' -f2-)

  if [ -z "$SERVICE_ROLE_KEY" ]; then
    print_error "SERVICE_ROLE_KEY não encontrada no .env"
    return 1
  fi

  # Copiar edge function atualizada
  detect_repo
  if [ -n "$REPO_DIR" ] && [ -f "$REPO_DIR/supabase/functions/send-reminders/index.ts" ]; then
    FUNC_DIR="$SUPABASE_DIR/volumes/functions/send-reminders"
    mkdir -p "$FUNC_DIR"
    cp "$REPO_DIR/supabase/functions/send-reminders/index.ts" "$FUNC_DIR/index.ts"
    print_success "Edge function send-reminders atualizada"

    cd "$SUPABASE_DIR"
    docker compose restart functions 2>/dev/null || true
    sleep 3
  fi

  # Criar script wrapper
  CRON_SCRIPT="/root/send-reminders-cron.sh"
  cat > "$CRON_SCRIPT" << 'CRONEOF'
#!/bin/bash
# Chamado pelo cron a cada minuto para disparar lembretes
SUPABASE_DIR="/opt/gestaopro/supabase-docker"
SERVICE_ROLE_KEY=$(grep -E "^SERVICE_ROLE_KEY=" "$SUPABASE_DIR/.env" | cut -d'=' -f2-)

curl -s -X POST "http://localhost:8000/functions/v1/send-reminders" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  >> /var/log/gestaopro-reminders.log 2>&1

echo "" >> /var/log/gestaopro-reminders.log
CRONEOF

  chmod +x "$CRON_SCRIPT"

  # Criar log
  touch /var/log/gestaopro-reminders.log
  chmod 666 /var/log/gestaopro-reminders.log

  # Adicionar ao crontab (remove duplicata se existir)
  CRON_LINE="* * * * * $CRON_SCRIPT"
  (crontab -l 2>/dev/null | grep -v "send-reminders-cron.sh"; echo "$CRON_LINE") | crontab -

  # Testar
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "http://localhost:8000/functions/v1/send-reminders" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    2>/dev/null || echo "000")

  if [ "$RESPONSE" = "200" ]; then
    print_success "send-reminders testada com sucesso (HTTP 200)"
  else
    print_warn "send-reminders retornou HTTP $RESPONSE (pode ser normal)"
  fi

  print_success "Crontab configurado (executa a cada minuto)"
}

do_setup_reminders() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  ⏰ Ativar Lembretes Automáticos                 ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  setup_reminders_cron

  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ Cron de lembretes ativo!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Frequência:  a cada 1 minuto"
  echo -e "  Log:         /var/log/gestaopro-reminders.log"
  echo -e "  Script:      /root/send-reminders-cron.sh"
  echo ""
  echo -e "  ${CYAN}Como funciona:${NC}"
  echo -e "    1. Cron roda a cada minuto"
  echo -e "    2. Chama send-reminders edge function"
  echo -e "    3. Calcula horário de Brasília (UTC-3)"
  echo -e "    4. Busca lembretes com send_time <= hora atual"
  echo -e "    5. Envia mensagem via WhatsApp (WuzAPI)"
  echo ""
  echo -e "  ${CYAN}Comandos úteis:${NC}"
  echo -e "    Ver log:     tail -f /var/log/gestaopro-reminders.log"
  echo -e "    Ver crontab: crontab -l"
  echo ""
}

# ═══════════════════════════════════════════════════════════════
#  OPÇÃO 4: STATUS DO SISTEMA
# ═══════════════════════════════════════════════════════════════
do_status() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  📊 Status do Sistema                            ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  # Containers
  echo -e "  ${BOLD}Docker Containers:${NC}"
  if docker compose -f "$SUPABASE_DIR/docker-compose.yml" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null; then
    echo ""
  else
    docker ps --filter "name=supabase" --format "    {{.Names}}: {{.Status}}" 2>/dev/null || echo "    Docker não está rodando"
  fi

  # RAM
  echo -e "  ${BOLD}Memória:${NC}"
  free -h | grep -E "Mem|Swap" | awk '{printf "    %-6s Total: %-8s Usado: %-8s Livre: %s\n", $1, $2, $3, $7}'
  echo ""

  # Nginx
  echo -e "  ${BOLD}Nginx:${NC}"
  if systemctl is-active nginx > /dev/null 2>&1; then
    echo -e "    Status: ${GREEN}Ativo${NC}"
    SITES=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    echo "    Sites:  $SITES"
  else
    echo -e "    Status: ${RED}Inativo${NC}"
  fi
  echo ""

  # Cron de Lembretes
  echo -e "  ${BOLD}Cron de Lembretes:${NC}"
  if crontab -l 2>/dev/null | grep -q "send-reminders-cron.sh"; then
    echo -e "    Status: ${GREEN}Ativo${NC} (a cada minuto)"
    if [ -f /var/log/gestaopro-reminders.log ]; then
      LAST_LOG=$(tail -1 /var/log/gestaopro-reminders.log 2>/dev/null | head -c 100)
      if [ -n "$LAST_LOG" ]; then
        echo "    Último log: $LAST_LOG"
      fi
    fi
  else
    echo -e "    Status: ${RED}Inativo${NC} (execute opção 3 para ativar)"
  fi
  echo ""

  # URLs
  echo -e "  ${BOLD}URLs:${NC}"
  detect_repo
  if [ -n "$REPO_DIR" ] && [ -f "$REPO_DIR/.env" ]; then
    VITE_URL=$(grep 'VITE_SUPABASE_URL' "$REPO_DIR/.env" 2>/dev/null | cut -d'=' -f2-)
    echo "    Supabase: ${VITE_URL:-desconhecido}"
  fi

  NGINX_PORT=$(grep -oP 'listen\s+\K[0-9]+' /etc/nginx/sites-enabled/gestaopro 2>/dev/null | head -1)
  if [ -n "$NGINX_PORT" ]; then
    IP_ADDR=$(hostname -I | awk '{print $1}')
    echo "    Frontend (IP):     http://${IP_ADDR}:$NGINX_PORT"
    echo "    Super Admin (IP):  http://${IP_ADDR}:$NGINX_PORT/super-admin"
    echo "    Admin Panel (IP):  http://${IP_ADDR}:$NGINX_PORT/admin"
  fi

  DOMAIN_CONF=$(grep -oP 'server_name\s+\K[^;]+' /etc/nginx/sites-enabled/gestaopro-domain 2>/dev/null | head -1)
  if [ -n "$DOMAIN_CONF" ]; then
    echo "    Frontend (domínio):    https://$DOMAIN_CONF"
    echo "    Super Admin (domínio): https://$DOMAIN_CONF/super-admin"
    echo "    Admin Panel (domínio): https://$DOMAIN_CONF/admin"
  fi
  echo ""

  # Usuários do sistema
  echo -e "  ${BOLD}Usuários:${NC}"
  docker exec supabase-db psql -U postgres -d postgres -t -c \
    "SELECT role, count(*) FROM user_roles GROUP BY role ORDER BY role;" 2>/dev/null | while read line; do
    if [ -n "$line" ]; then
      echo "    $line"
    fi
  done
  echo ""

  # Disco
  echo -e "  ${BOLD}Disco:${NC}"
  df -h / | tail -1 | awk '{printf "    Total: %s  Usado: %s (%s)  Livre: %s\n", $2, $3, $5, $4}'
  echo ""

  read -p "  Pressione Enter para voltar ao menu..."
}

# ═══════════════════════════════════════════════════════════════
#  LOOP PRINCIPAL
# ═══════════════════════════════════════════════════════════════
while true; do
  show_menu
  read OPTION

  case $OPTION in
    1)
      do_full_install
      echo ""
      read -p "  Pressione Enter para voltar ao menu..."
      ;;
    2)
      do_setup_domain
      echo ""
      read -p "  Pressione Enter para voltar ao menu..."
      ;;
    3)
      do_setup_reminders
      echo ""
      read -p "  Pressione Enter para voltar ao menu..."
      ;;
    4)
      do_status
      ;;
    0)
      echo ""
      echo -e "  ${GREEN}Até mais! 👋${NC}"
      echo ""
      exit 0
      ;;
    *)
      echo -e "  ${RED}Opção inválida!${NC}"
      sleep 1
      ;;
  esac
done
