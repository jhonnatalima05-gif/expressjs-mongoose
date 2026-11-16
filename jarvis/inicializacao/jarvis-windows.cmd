@echo off
rem ==========================================================================
rem  Abre a Central do JARVIS quando o Windows liga (com musica e voz).
rem  1. Troque SEU-APP abaixo pelo endereco do seu servidor no Railway.
rem  2. Aperte Win+R, digite  shell:startup  e de Enter.
rem  3. Copie este arquivo (ou um atalho para ele) para a pasta que abriu.
rem  Na primeira vez: toque em Ativar, permita o microfone e escolha a musica
rem  nas configuracoes. Das proximas vezes ele liga sozinho.
rem ==========================================================================
set "JARVIS_URL=https://SEU-APP.up.railway.app/jarvis/central?auto=1"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Google Chrome nao encontrado. Instale o Chrome e rode de novo.
  pause
  exit /b 1
)

rem Perfil separado para a central: assim as opcoes abaixo sempre valem,
rem mesmo com o seu Chrome normal ja aberto.
start "" "%CHROME%" --user-data-dir="%LocalAppData%\JarvisCentral" --app="%JARVIS_URL%" --autoplay-policy=no-user-gesture-required --start-maximized
