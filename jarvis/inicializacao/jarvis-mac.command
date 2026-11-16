#!/bin/bash
# Abre a Central do JARVIS quando o Mac liga (com música e voz).
# 1. Troque SEU-APP abaixo pelo endereço do seu servidor no Railway.
# 2. Ajustes do Sistema → Geral → Itens de Início → "+" → escolha este arquivo.
# Na primeira vez: toque em Ativar, permita o microfone e escolha a música nas configurações.
JARVIS_URL="https://SEU-APP.up.railway.app/jarvis/central?auto=1"

open -na "Google Chrome" --args \
  --user-data-dir="$HOME/Library/Application Support/JarvisCentral" \
  --app="$JARVIS_URL" \
  --autoplay-policy=no-user-gesture-required
