FROM node:20-alpine

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install --production

# Copiar código
COPY . .

# Porta do gateway
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/server.js"]
