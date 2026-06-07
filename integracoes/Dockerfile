FROM node:20-slim

# Instalar dependências do Chromium
RUN apt-get update && apt-get install -y \
    xvfb \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json e instalar dependências locais
COPY package.json ./
RUN npm install --production

# Instalar Playwright Chromium
RUN npx playwright install chromium

# Copiar código da aplicação
COPY . .

# Expor porta da aplicação
EXPOSE 3500

CMD ["xvfb-run", "-a", "node", "server.mjs"]
