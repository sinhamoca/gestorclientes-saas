#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════
#  GestãoPro - Configuração de Domínio
#  
#  Requisitos:
#    - Instalação base já feita (setup.sh)
#    - Domínio apontando para o IP do servidor no Cloudflare
#    - Proxy do Cloudflare ativado (nuvem laranja)
#    - SSL do Cloudflare em "Flexible" ou "Full"
# ═══════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✖]${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

# ─────────────────────────────────────
#  Detectar paths
# ─────────────────────────────────────
if [ -d "/root/gestorv2/client-connect-pro" ]; then
  APP_DIR="/root/gestorv2/client-connect-pro"
elif [ -d "/opt/gestaopro/app" ]; then
  APP_DIR="/opt/gestaopro/app"
else
  err "Diretório do projeto não encontrado. Execute o setup.sh primeiro."
fi

if [ -d "/opt/gestaopro/supabase-docker" ]; then
  SUPABASE_DIR="/opt/gestaopro/supabase-docker"
else
  err "Supabase não encontrado. Execute o setup.sh primeiro."
fi

ENV_FILE="$SUPABASE_DIR/.env"
DIST_DIR="$APP_DIR/dist"

[ -f "$ENV_FILE" ] || err "Arquivo .env do Supabase não encontrado: $ENV_FILE"
[ -d "$DIST_DIR" ] || err "Frontend não compilado. Execute: cd $APP_DIR && npm run build"

# ─────────────────────────────────────
#  Coletar informações
# ─────────────────────────────────────
step "Configuração de Domínio"

read -p "Domínio (ex: gestao.seusite.com): " DOMAIN
[ -z "$DOMAIN" ] && err "Domínio não pode ser vazio"

# Detectar porta atual do app
CURRENT_PORT=$(grep -oP 'listen\s+\K[0-9]+' /etc/nginx/sites-enabled/gestaopro 2>/dev/null | head -1)
CURRENT_PORT=${CURRENT_PORT:-4010}
read -p "Porta interna do app [${CURRENT_PORT}]: " APP_PORT
APP_PORT=${APP_PORT:-$CURRENT_PORT}

# Detectar porta do Supabase
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

# ─────────────────────────────────────
#  1. Configurar Nginx
# ─────────────────────────────────────
step "1/5 - Configurando Nginx"

# Manter o config antigo (acesso por IP:porta) e adicionar o novo (domínio:80)
cat > /etc/nginx/sites-available/gestaopro-domain << NGINXEOF
# GestãoPro - Domínio com Cloudflare SSL
# Gerado em: $(date)

server {
    listen 80;
    server_name ${DOMAIN};

    # Frontend - arquivos estáticos
    root ${DIST_DIR};
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

    # Cache de assets estáticos
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy para Supabase API (auth, rest, functions, storage, realtime)
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

    # WebSocket para Realtime
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

    # SPA fallback - todas as outras rotas vão pro index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXEOF

# Ativar o site
ln -sf /etc/nginx/sites-available/gestaopro-domain /etc/nginx/sites-enabled/gestaopro-domain

# Testar config do Nginx
nginx -t || err "Configuração do Nginx inválida"
log "Nginx configurado para ${DOMAIN}"

# ─────────────────────────────────────
#  2. Atualizar Frontend (.env)
# ─────────────────────────────────────
step "2/5 - Atualizando frontend"

FRONTEND_ENV="$APP_DIR/.env"

# Guardar valores das chaves atuais
ANON_KEY=$(grep '^ANON_KEY=' "$ENV_FILE" | cut -d'=' -f2)

# Atualizar ou criar .env do frontend
cat > "$FRONTEND_ENV" << ENVEOF
VITE_SUPABASE_URL=${PUBLIC_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
ENVEOF

log "Frontend .env atualizado com URL: ${PUBLIC_URL}"

# ─────────────────────────────────────
#  3. Rebuild frontend
# ─────────────────────────────────────
step "3/5 - Recompilando frontend"

cd "$APP_DIR"
npm run build 2>&1 | tail -5

if [ -f "dist/index.html" ]; then
  chmod -R 755 dist/
  log "Frontend compilado"
else
  err "Falha na compilação do frontend"
fi

# ─────────────────────────────────────
#  4. Atualizar banco de dados
# ─────────────────────────────────────
step "4/5 - Atualizando configurações no banco"

# Atualizar app_url
docker exec supabase-db psql -U postgres -d postgres -c \
  "INSERT INTO system_settings (key, value) VALUES ('app_url', '${PUBLIC_URL}')
   ON CONFLICT (key) DO UPDATE SET value = '${PUBLIC_URL}';" \
  > /dev/null 2>&1

log "app_url atualizado para ${PUBLIC_URL}"

# ─────────────────────────────────────
#  5. Reiniciar serviços
# ─────────────────────────────────────
step "5/5 - Reiniciando serviços"

systemctl reload nginx
log "Nginx recarregado"

docker restart supabase-edge-functions > /dev/null 2>&1
log "Edge functions reiniciadas"

# ─────────────────────────────────────
#  Verificação
# ─────────────────────────────────────
step "Verificação"

# Testar Nginx
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:80" -H "Host: ${DOMAIN}" | grep -q "200"; then
  log "Nginx respondendo na porta 80"
else
  warn "Nginx pode não estar respondendo (normal se Cloudflare ainda não propagou)"
fi

# Testar proxy do Supabase
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/rest/v1/" -H "Host: ${DOMAIN}" -H "apikey: ${ANON_KEY}")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  log "Proxy Supabase funcionando"
else
  warn "Proxy Supabase retornou HTTP ${HTTP_CODE}"
fi

# ─────────────────────────────────────
#  Resumo
# ─────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Domínio configurado com sucesso!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  URL:  ${GREEN}${PUBLIC_URL}${NC}"
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
echo -e "  ${YELLOW}Após configurar o Cloudflare:${NC}"
echo -e "  • Acesse ${GREEN}${PUBLIC_URL}${NC} para testar"
echo -e "  • Webhooks do Mercado Pago funcionarão automaticamente"
echo -e "  • Pagamentos PIX e Cartão com confirmação automática"
echo ""
echo -e "  ${BLUE}Acesso por IP continua funcionando:${NC}"
echo -e "  • http://$(curl -s ifconfig.me 2>/dev/null || echo "SEU_IP"):${APP_PORT}"
echo ""
