#!/bin/zsh
# Запуск браузера Luch: при первом запуске ставит Electron (движок Chromium)
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null; then
  echo "Не найден Node.js. Установите его с https://nodejs.org и запустите этот файл снова."
  read -k1
  exit 1
fi
if [ ! -d node_modules/electron ]; then
  echo "Первый запуск: устанавливаю движок Chromium (Electron)…"
  npm install || { echo "Установка не удалась"; read -k1; exit 1; }
fi
npm start
