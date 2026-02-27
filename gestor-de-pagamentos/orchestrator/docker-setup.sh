#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ⚡ Payment Orchestrator v2 - Docker Setup   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}[1/4]${NC} Construindo containers..."
docker compose build --no-cache

echo -e "${YELLOW}[2/4]${NC} Subindo serviços..."
docker compose up -d

echo -e "${YELLOW}[3/4]${NC} Aguardando API..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3500/health > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ API pronta${NC}"
    break
  fi
  [ $i -eq 30 ] && echo "   ⚠️  Verifique: docker compose logs api"
  sleep 2
done

echo -e "${YELLOW}[4/4]${NC} Configurando banco..."
docker compose exec -T api npx prisma db push --accept-data-loss
docker compose exec -T api npx tsx prisma/seed.ts

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Tudo rodando!                    ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  🌐 Dashboard: http://SEU_IP:5173            ║${NC}"
echo -e "${GREEN}║  🔌 API:       http://SEU_IP:3500            ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  👑 Super Admin: admin@orchestrator.com      ║${NC}"
echo -e "${GREEN}║  🔑 Senha:      admin123                     ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Comandos:                                   ║${NC}"
echo -e "${GREEN}║    docker compose logs -f     (logs)         ║${NC}"
echo -e "${GREEN}║    docker compose ps          (status)       ║${NC}"
echo -e "${GREEN}║    docker compose down        (parar)        ║${NC}"
echo -e "${GREEN}║    docker compose up -d       (iniciar)      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
