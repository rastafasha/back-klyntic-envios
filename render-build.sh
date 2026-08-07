#!/usr/bin/env bash
# Salir si ocurre un error en algún paso
set -o errexit

# 1. Instalar las dependencias normales de tu proyecto
npm install

# 2. Forzar a Puppeteer a descargar el Chrome de Linux en el servidor
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p $PUPPETEER_CACHE_DIR
npx puppeteer browsers install chrome
