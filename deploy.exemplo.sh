#!/bin/bash
# Publica o ZapZap em um diretório e carimba a versão (força a atualização nos navegadores a cada publicação).
# Uso: ./deploy.exemplo.sh /var/www/zapzap [versao]
set -e
DST="${1:?informe o diretório de destino}"; V="${2:-1.0.$(date +%y%m%d%H%M)}"
for f in $(find src -name '*.php'); do php -l "$f" >/dev/null; done
mkdir -p "$DST"; rsync -a --delete src/ "$DST/"
find "$DST" -type f \( -name '*.php' -o -name '*.js' -o -name '*.css' -o -name '*.webmanifest' -o -name '*.svg' \) -exec sed -i "s/__V__/$V/g" {} +
echo "ZapZap v$V publicado em $DST"
