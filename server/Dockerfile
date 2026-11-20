# API do DentOS (login, funcoes e agendamentos). Build a partir da RAIZ do repositorio:
#   docker build -f server/Dockerfile .
# porque as funcoes originais ficam em supabase/functions.
FROM node:24-alpine

WORKDIR /app/server
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY supabase/functions /app/supabase/functions
COPY supabase/config.toml /app/supabase/config.toml

ENV FUNCTIONS_DIR=/app/supabase/functions
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1

USER node
CMD ["node", "index.js"]
