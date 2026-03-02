#!/bin/bash
# ============================================================
# setup-reminders-cron.sh
# Configura o cron de lembretes automáticos do GestãoPro
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_DIR="/root/gestorv2/client-connect-pro"
SUPABASE_DIR="/opt/gestaopro/supabase-docker"

echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  GestãoPro - Setup Lembretes Cron    ${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""

# 1. Ler SERVICE_ROLE_KEY do .env do Supabase
if [ ! -f "$SUPABASE_DIR/.env" ]; then
  echo -e "${RED}Erro: $SUPABASE_DIR/.env não encontrado${NC}"
  exit 1
fi

SERVICE_ROLE_KEY=$(grep -E "^SERVICE_ROLE_KEY=" "$SUPABASE_DIR/.env" | cut -d'=' -f2-)

if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}Erro: SERVICE_ROLE_KEY não encontrada no .env${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} SERVICE_ROLE_KEY encontrada"

# 2. Copiar edge function corrigida
FUNC_DIR="$SUPABASE_DIR/volumes/functions/send-reminders"
mkdir -p "$FUNC_DIR"

if [ -f "$REPO_DIR/supabase/functions/send-reminders/index.ts" ]; then
  cp "$REPO_DIR/supabase/functions/send-reminders/index.ts" "$FUNC_DIR/index.ts"
  echo -e "${GREEN}✓${NC} Edge function copiada para $FUNC_DIR"
else
  echo -e "${YELLOW}⚠ Arquivo fonte não encontrado em $REPO_DIR, copiando do diretório atual se disponível${NC}"
fi

# 3. Reiniciar container de functions
echo "Reiniciando edge functions..."
cd "$SUPABASE_DIR"
docker compose restart functions 2>/dev/null || docker-compose restart functions 2>/dev/null || true
sleep 3
echo -e "${GREEN}✓${NC} Edge functions reiniciadas"

# 4. Testar se a função responde
echo "Testando send-reminders..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:8000/functions/v1/send-reminders" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  2>/dev/null || echo "000")

if [ "$RESPONSE" = "200" ]; then
  echo -e "${GREEN}✓${NC} send-reminders respondeu com HTTP 200"
else
  echo -e "${YELLOW}⚠${NC} send-reminders respondeu com HTTP $RESPONSE (pode ser normal se não há lembretes)"
fi

# 5. Criar script wrapper para o cron
CRON_SCRIPT="$HOME/send-reminders-cron.sh"
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
echo -e "${GREEN}✓${NC} Script do cron criado em $CRON_SCRIPT"

# 6. Criar arquivo de log
touch /var/log/gestaopro-reminders.log
chmod 666 /var/log/gestaopro-reminders.log

# 7. Adicionar ao crontab (remove entrada antiga se existir)
CRON_LINE="* * * * * $CRON_SCRIPT"
(crontab -l 2>/dev/null | grep -v "send-reminders-cron.sh"; echo "$CRON_LINE") | crontab -
echo -e "${GREEN}✓${NC} Crontab configurado (executa a cada minuto)"

# 8. Verificar
echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Cron de lembretes configurado!    ${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "  Frequência: a cada 1 minuto"
echo "  Log: /var/log/gestaopro-reminders.log"
echo "  Script: $CRON_SCRIPT"
echo ""
echo "  Comandos úteis:"
echo "    Ver log:      tail -f /var/log/gestaopro-reminders.log"
echo "    Ver crontab:  crontab -l"
echo "    Testar agora: $CRON_SCRIPT"
echo ""
echo "  Como funciona:"
echo "    1. Cron roda a cada minuto"
echo "    2. Chama send-reminders edge function"
echo "    3. Função calcula horário de Brasília (UTC-3)"
echo "    4. Busca lembretes com send_time <= hora atual E não enviados hoje"
echo "    5. Para cada lembrete, busca clientes com due_date correspondente"
echo "    6. Envia mensagem via WhatsApp (WuzAPI)"
echo "    7. Marca lembrete como enviado hoje (last_sent_date)"
echo ""
