#!/bin/bash

# Iniciar Xvfb no display :99 em background
echo "[START] Iniciando Xvfb no display :99..."
Xvfb :99 -screen 0 1280x1024x24 -ac &
XVFB_PID=$!

# Esperar o Xvfb inicializar
sleep 2

# Exportar a variavel DISPLAY
export DISPLAY=:99

echo "[START] Iniciando servidor Express..."
# Executar o servidor node
exec node server.mjs
