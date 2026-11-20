# -------- Build Stage --------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Endereco e chave publica (anon) da API compativel com Supabase.
# VITE_SUPABASE_URL vazio = mesmo dominio do site (nginx encaminha /rest, /auth, /functions).
# VITE_SUPABASE_PUBLISHABLE_KEY = chave anon gerada por `node server/scripts/gerar-chaves.mjs`.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Build the Vite app
RUN npm run build

# -------- Production Stage --------
FROM nginx:alpine

# nginx.conf e um template: as variaveis abaixo sao trocadas ao iniciar o container.
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=dentos-api:3001
ENV INTEGRACOES_UPSTREAM=dentos-integracoes:3500
ENV NGINX_RESOLVER=127.0.0.11
# So estas variaveis sao trocadas no template (as $variaveis do nginx ficam intactas).
ENV NGINX_ENVSUBST_FILTER="^(API_UPSTREAM|INTEGRACOES_UPSTREAM|NGINX_RESOLVER)$"
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 3000
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
