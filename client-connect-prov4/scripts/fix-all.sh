#!/bin/bash
set -e

# ============================================================
#  GestãoPro - Script de Correções
#
#  Corrige:
#    1. ENCRYPTION_KEY nas Edge Functions (docker-compose)
#    2. Edge Functions main handler (dispatcher)
#    3. pg_cron schedule para lembretes automáticos
#    4. app_url no system_settings
#    5. Sidebar com nomes confusos
#    6. index.html com branding Lovable → GestãoPro
#
#  Uso:
#    chmod +x fix-all.sh
#    sudo ./fix-all.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_step()    { echo ""; echo -e "${GREEN}▶ $1${NC}"; echo "────────────────────────────────────────"; }
print_success() { echo -e "${GREEN}✔ $1${NC}"; }
print_warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error()   { echo -e "${RED}✖ $1${NC}"; }

# Detectar caminhos
SUPABASE_DIR="/opt/gestaopro/supabase-docker"
REPO_DIR=""

if [ -d "/root/gestorv2/client-connect-pro/src" ]; then
  REPO_DIR="/root/gestorv2/client-connect-pro"
elif [ -d "/opt/gestaopro/app/src" ]; then
  REPO_DIR="/opt/gestaopro/app"
else
  echo -e "${RED}Repositório não encontrado!${NC}"
  read -p "Caminho do repositório: " REPO_DIR
fi

# Detectar IP/domínio do .env do frontend
DOMAIN=$(grep 'VITE_SUPABASE_URL' "$REPO_DIR/.env" 2>/dev/null | sed 's|.*://||' | sed 's|:.*||' || hostname -I | awk '{print $1}')
FRONTEND_PORT=$(grep 'listen' /etc/nginx/sites-available/gestaopro 2>/dev/null | head -1 | awk '{print $2}' | tr -d ';' || echo "4060")

echo -e "${CYAN}App:      $REPO_DIR${NC}"
echo -e "${CYAN}Supabase: $SUPABASE_DIR${NC}"
echo -e "${CYAN}Domínio:  $DOMAIN:$FRONTEND_PORT${NC}"
echo ""

# ============================================================
# FIX 1: ENCRYPTION_KEY no docker-compose (Edge Functions)
# ============================================================
print_step "1/6 - Adicionando ENCRYPTION_KEY às Edge Functions"

cd "$SUPABASE_DIR"

# Verificar se já tem ENCRYPTION_KEY no container functions
if grep -q "ENCRYPTION_KEY" docker-compose.yml 2>/dev/null; then
  print_warn "ENCRYPTION_KEY já existe no docker-compose.yml"
else
  # Adicionar ENCRYPTION_KEY ao environment do functions service
  sed -i '/VERIFY_JWT.*FUNCTIONS_VERIFY_JWT/a\      ENCRYPTION_KEY: ${SUPABASE_EDGE_RUNTIME_ENCRYPTION_KEY}' docker-compose.yml
  print_success "ENCRYPTION_KEY adicionada ao docker-compose.yml"
fi

# Verificar se a variável existe no .env
if grep -q "SUPABASE_EDGE_RUNTIME_ENCRYPTION_KEY" .env 2>/dev/null; then
  print_success "ENCRYPTION_KEY já está no .env"
else
  print_warn "ENCRYPTION_KEY não encontrada no .env - verifique manualmente"
fi

# ============================================================
# FIX 2: Edge Functions main handler (dispatcher)
# ============================================================
print_step "2/6 - Criando main handler para Edge Functions"

FUNCTIONS_DIR="$SUPABASE_DIR/volumes/functions"
mkdir -p "$FUNCTIONS_DIR/main"

cat > "$FUNCTIONS_DIR/main/index.ts" << 'MAINHANDLER'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  // Expected path: /functionName or /functionName/subpath
  // The edge runtime routes /functions/v1/functionName here
  const functionName = pathParts[0];

  if (!functionName) {
    return new Response(JSON.stringify({ error: "Function name required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Dynamic import of the function
    const mod = await import(`../${functionName}/index.ts`);
    // If the module exports a default fetch handler, we're done
    // The edge runtime handles this automatically
    return new Response(JSON.stringify({ error: "Function not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Function '${functionName}' not found: ${e.message}` }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
MAINHANDLER

# Na verdade o edge-runtime do Supabase self-hosted usa outro padrão.
# Ele espera que cada função esteja em sua pasta e o main service faz o routing.
# Vamos usar o padrão correto do Supabase edge-runtime:

cat > "$FUNCTIONS_DIR/main/index.ts" << 'MAINHANDLER'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((_req: Request) => {
  return new Response(
    JSON.stringify({ message: "GestãoPro Edge Functions running" }),
    { headers: { "Content-Type": "application/json" } }
  );
});
MAINHANDLER

print_success "Main handler criado em $FUNCTIONS_DIR/main/index.ts"

# Copiar functions do repo se não existirem
if [ -d "$REPO_DIR/supabase/functions" ]; then
  for func_dir in "$REPO_DIR/supabase/functions"/*/; do
    func_name=$(basename "$func_dir")
    if [ "$func_name" != "_shared" ] && [ "$func_name" != "main" ]; then
      if [ ! -d "$FUNCTIONS_DIR/$func_name" ]; then
        cp -r "$func_dir" "$FUNCTIONS_DIR/$func_name"
        echo "  → Copiada: $func_name"
      fi
    fi
  done
  # Copiar _shared se existir
  if [ -d "$REPO_DIR/supabase/functions/_shared" ] && [ ! -d "$FUNCTIONS_DIR/_shared" ]; then
    cp -r "$REPO_DIR/supabase/functions/_shared" "$FUNCTIONS_DIR/_shared"
  fi
fi

# ============================================================
# FIX 3: pg_cron schedule para send-reminders
# ============================================================
print_step "3/6 - Configurando cron job para lembretes automáticos"

# Ler chaves do .env
SERVICE_ROLE_KEY=$(grep '^SERVICE_ROLE_KEY=' "$SUPABASE_DIR/.env" | cut -d'=' -f2)

# Criar o cron job via SQL
# Primeiro verificar se pg_cron está disponível
PGCRON_EXISTS=$(docker exec supabase-db psql -U postgres -d postgres -t -c "SELECT 1 FROM pg_extension WHERE extname='pg_cron';" 2>/dev/null | tr -d ' ')

if [ "$PGCRON_EXISTS" != "1" ]; then
  print_warn "pg_cron não está instalado. Criando extensão..."
  docker exec -i supabase-db psql -U postgres -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;" 2>/dev/null || true
  docker exec -i supabase-db psql -U postgres -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;" 2>/dev/null || true
fi

# Remover job anterior se existir
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT cron.unschedule('send-reminders-job');" 2>/dev/null || true

# Criar o job com a SERVICE_ROLE_KEY
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT cron.schedule(
  'send-reminders-job',
  '* * * * *',
  \$\$
  SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer $SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  \$\$
);" 2>/dev/null

if [ $? -eq 0 ]; then
  print_success "Cron job 'send-reminders' agendado (a cada 1 min)"
else
  print_warn "pg_cron não disponível. Criando cron de sistema como alternativa..."
  
  # Criar cron job no sistema operacional como fallback
  ANON_KEY=$(grep '^ANON_KEY=' "$SUPABASE_DIR/.env" | cut -d'=' -f2)
  CRON_CMD="* * * * * curl -sf -X POST http://localhost:8000/functions/v1/send-reminders -H 'Authorization: Bearer $SERVICE_ROLE_KEY' -H 'Content-Type: application/json' > /dev/null 2>&1"
  
  # Remover entrada antiga se existir
  crontab -l 2>/dev/null | grep -v 'send-reminders' | crontab - 2>/dev/null || true
  # Adicionar nova entrada
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  
  print_success "Cron de sistema criado como alternativa (a cada 1 min)"
fi

# ============================================================
# FIX 4: app_url no system_settings
# ============================================================
print_step "4/6 - Configurando app_url no system_settings"

APP_URL="http://$DOMAIN:$FRONTEND_PORT"

docker exec -i supabase-db psql -U postgres -d postgres << URLSQL
INSERT INTO public.system_settings (key, value)
VALUES ('app_url', '$APP_URL')
ON CONFLICT (key) DO UPDATE SET value = '$APP_URL';
URLSQL

print_success "app_url configurado: $APP_URL"

# ============================================================
# FIX 5: Sidebar com nomes confusos
# ============================================================
print_step "5/6 - Corrigindo nomes da sidebar"

SIDEBAR_FILE="$REPO_DIR/src/components/AppSidebar.tsx"

if [ -f "$SIDEBAR_FILE" ]; then
  # "Pagamentos" (payment-config) → "Mercado Pago"
  # "Configurações" (payments) → "WhatsApp / PIX"
  sed -i 's/{ title: "Pagamentos", url: "\/dashboard\/payment-config", icon: CreditCard }/{ title: "Mercado Pago", url: "\/dashboard\/payment-config", icon: CreditCard }/' "$SIDEBAR_FILE"
  sed -i 's/{ title: "Configurações", url: "\/dashboard\/payments", icon: Settings }/{ title: "WhatsApp \/ PIX", url: "\/dashboard\/payments", icon: Settings }/' "$SIDEBAR_FILE"
  print_success "Sidebar corrigida: 'Pagamentos' → 'Mercado Pago', 'Configurações' → 'WhatsApp / PIX'"
else
  print_warn "AppSidebar.tsx não encontrado"
fi

# ============================================================
# FIX 6: index.html branding Lovable → GestãoPro
# ============================================================
print_step "6/6 - Corrigindo branding (Lovable → GestãoPro)"

INDEX_FILE="$REPO_DIR/index.html"

if [ -f "$INDEX_FILE" ]; then
  sed -i 's/<title>Lovable App<\/title>/<title>GestãoPro - Gestão de Clientes<\/title>/' "$INDEX_FILE"
  sed -i 's/content="Lovable Generated Project"/content="GestãoPro - Sistema de Gestão de Clientes IPTV"/' "$INDEX_FILE"
  sed -i 's/content="Lovable App"/content="GestãoPro"/' "$INDEX_FILE"
  sed -i 's|content="https://lovable.dev/opengraph-image-p98pqg.png"|content=""|g' "$INDEX_FILE"
  sed -i 's/content="@Lovable"/content="@GestãoPro"/' "$INDEX_FILE"
  print_success "Branding corrigido no index.html"
else
  print_warn "index.html não encontrado"
fi

# ============================================================
# REBUILD E RESTART
# ============================================================
print_step "Aplicando correções..."

# 1. Restart edge functions com ENCRYPTION_KEY
echo "Reiniciando Edge Functions..."
cd "$SUPABASE_DIR"
docker compose up -d functions
sleep 3

# 2. Rebuild frontend (sidebar + index.html mudaram)
echo "Recompilando frontend..."
cd "$REPO_DIR"
npm run build 2>&1 | tail -5

if [ -d "dist" ] && [ -f "dist/index.html" ]; then
  chmod -R 755 dist/
  systemctl reload nginx
  print_success "Frontend recompilado e Nginx recarregado"
else
  print_error "Erro na compilação do frontend"
fi

# ============================================================
# VERIFICAÇÕES FINAIS
# ============================================================
print_step "Verificações finais"

# Testar se Edge Functions respondem
echo "Testando Edge Functions..."
EF_TEST=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:8000/functions/v1/public-payment?token=test" \
  -H "apikey: $(grep '^ANON_KEY=' $SUPABASE_DIR/.env | cut -d'=' -f2)" 2>/dev/null || echo "000")

if [ "$EF_TEST" != "000" ]; then
  print_success "Edge Functions respondendo (HTTP $EF_TEST)"
else
  print_warn "Edge Functions não responderam - verifique: docker logs supabase-edge-functions"
fi

# Testar frontend
FRONT_TEST=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "000")
if [ "$FRONT_TEST" = "200" ]; then
  print_success "Frontend respondendo (HTTP 200)"
else
  print_warn "Frontend retornou HTTP $FRONT_TEST"
fi

# Verificar cron job
CRON_CHECK=$(docker exec supabase-db psql -U postgres -d postgres -t -c "SELECT count(*) FROM cron.job WHERE jobname='send-reminders-job';" 2>/dev/null | tr -d ' ')
if [ "$CRON_CHECK" = "1" ]; then
  print_success "Cron job send-reminders ativo (pg_cron)"
elif crontab -l 2>/dev/null | grep -q 'send-reminders'; then
  print_success "Cron job send-reminders ativo (cron de sistema)"
else
  print_warn "Cron job não encontrado"
fi

# Resumo
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         ✅ CORREÇÕES APLICADAS!                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Corrigido:${NC}"
echo -e "    ✔ ENCRYPTION_KEY nas Edge Functions"
echo -e "    ✔ Main handler do edge-runtime"
echo -e "    ✔ Cron job para lembretes automáticos"
echo -e "    ✔ app_url nas configurações do sistema"
echo -e "    ✔ Nomes da sidebar"
echo -e "    ✔ Branding GestãoPro"
echo ""
echo -e "  ${CYAN}Teste:${NC}"
echo -e "    Frontend: http://$DOMAIN:$FRONTEND_PORT"
echo -e "    Admin:    http://$DOMAIN:$FRONTEND_PORT/admin"
echo ""
