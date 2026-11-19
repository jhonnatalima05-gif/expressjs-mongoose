# Passo a passo: colocando o JARVIS para funcionar

Siga **na ordem**. Cada fase termina com um teste: só passe para a próxima quando o teste der certo.
Tempo total estimado: uma tarde para as fases 1 a 4; as outras dependem de aprovações da Meta (de horas a alguns dias).

> 🔐 **Regra de ouro:** chaves e tokens só vão nas *Variables* do Railway. Nunca cole em chat, no código ou no GitHub.

| Fase | O que liga | Obrigatória? |
|---|---|---|
| 1. Cérebro | Claude (Anthropic) | ✅ |
| 2. Servidor 24h | Railway + MongoDB | ✅ |
| 3. Controle remoto | Telegram | ✅ |
| 4. Seu jeito de pensar | perfil + catálogo | ✅ |
| 5. Vendas | webhook da plataforma | ✅ |
| 6. Anúncios | Meta Ads | recomendada |
| 7. Recuperação de PIX | WhatsApp oficial | recomendada |
| 8. Mineração | Apify | recomendada |
| 9. E-mail de suporte | Resend | opcional |
| 10. Voz e música | central + ElevenLabs | opcional |
| 11. Ligar a autonomia | — | quando confiar |

---

## Fase 1: O cérebro (Anthropic)

1. Acesse **console.anthropic.com** e crie a conta.
2. **Billing:** adicione créditos e **defina um limite de gasto mensal** (Settings → Limits). É a sua proteção contra surpresa na fatura.
3. **API Keys → Create Key.** Copie a chave (começa com `sk-ant-`) e guarde num lugar seguro: ela vai no Railway na fase 2.

## Fase 2: O servidor 24h (Railway + MongoDB)

1. **Juntar o código:** todo o JARVIS está no branch `claude/agente-chefe-vendas-oyriyj`. No GitHub, abra um *Pull Request* desse branch para o `main` e faça o *merge* (ou peça para o Claude criar o PR).
2. No **railway.app**, abra o projeto onde este repositório já roda (se ainda não existe: *New Project → Deploy from GitHub repo* → escolha `expressjs-mongoose`).
3. No mesmo projeto: **+ New → Database → MongoDB**.
4. No serviço do app → **Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | a chave da fase 1 |
   | `MONGO_URL` | use *Add Reference* → MongoDB → `MONGO_URL` |
   | `JARVIS_API_TOKEN` | invente uma senha longa (é a senha da central e da API) |
   | `JARVIS_AUTONOMIA` | `supervisionada` |
   | `JARVIS_TIMEZONE` | `America/Sao_Paulo` |

5. **Guardar os arquivos gerados:** no serviço do app → **Settings → Volumes → Add Volume**, *mount path* `/app/output`. Sem isso, as páginas de vendas e os produtos criados somem a cada deploy.
6. **Settings → Networking → Generate Domain.** Anote o endereço, por exemplo `https://jarvis-producao.up.railway.app`. Nas próximas fases ele aparece como **SEU-APP**.
7. Confirme que existe **uma única réplica** (Settings → Replicas = 1). Duas cópias brigariam pelas mensagens do Telegram.

✅ **Teste:** em *Deployments → View Logs* deve aparecer `🧠 JARVIS online`. (O aviso `Telegram não configurado` é normal até a fase 3.)

## Fase 3: O controle remoto (Telegram)

1. No Telegram, fale com **@BotFather** → `/newbot` → escolha nome e usuário. Copie o **token**.
2. Fale com **@userinfobot** → ele responde o seu **Id** (um número).
3. **Abra o seu bot e mande qualquer mensagem** (um bot não consegue falar com quem nunca falou com ele).
4. No Railway: `TELEGRAM_BOT_TOKEN` = token e `TELEGRAM_CHAT_ID` = seu Id.

✅ **Teste:** nos logs aparece `📱 Controle pelo Telegram ativo`. Mande `/start` para o bot: ele responde com os comandos. Mande **`/status`**: ele mostra ✅/❌ de cada integração e o que falta. Use esse comando ao longo de todas as fases para acompanhar o progresso. Mande `/panorama` (os números vão estar zerados, é normal). Mande "Jarvis, você está aí?".

## Fase 4: O seu jeito de pensar (perfil e catálogo)

Edite pelo próprio GitHub (abra o arquivo → lápis ✏️ → *Commit changes*). Cada commit no `main` gera um deploy novo.

1. **`jarvis/perfil-do-dono.md`:** metas, ROAS mínimo e para escalar, CPA máximo, como você decide tráfego, nichos que quer e não quer, o que ele pode fazer sozinho e quando te avisar. **É o arquivo que mais influencia as decisões dele.**
2. **`jarvis/catalogo.json`:** troque os exemplos pelas suas ofertas reais: link de cada checkout (principal, cartão, versão mais barata), quando usar cada um, respostas **verdadeiras** para as objeções, e o nome da atendente.
3. **`jarvis/calendario-sazonal.json`** (opcional): ajuste as janelas do ano ao seu mercado.

✅ **Teste:** no Telegram: "Jarvis, resuma como eu penso sobre escalar campanhas". Ele deve repetir o que você escreveu no perfil.

## Fase 5: As vendas (webhook da plataforma)

**Se você usa a Cakto** (o JARVIS já entende o formato oficial dela):
1. Painel Cakto → **Apps → Webhooks → Novo**. URL: `https://SEU-APP/webhook`.
2. Marque os eventos: **Compra aprovada**, **Pix gerado**, **Pix expirado** (e, se quiser, Compra recusada e Reembolso).
3. Copie o **secret** que a Cakto gerar para esse webhook e coloque no Railway como `CAKTO_WEBHOOK_SECRET`. Assim, o JARVIS recusa qualquer requisição que não venha da Cakto.
4. No painel, use **Testar webhook** para mandar um evento de exemplo.

**Se você usa a Ticto ou outra plataforma:**
1. Cadastre o webhook com a URL `https://SEU-APP/webhook`, marcando **venda aprovada** e **PIX gerado / aguardando pagamento**.
2. Os nomes de status variam entre plataformas: se o PIX gerado não for reconhecido, copie a linha `🔥 WEBHOOK RECEBIDO` do log e mande para o Claude.

✅ **Teste (as duas):** gere um PIX de valor baixo e **não pague**; depois faça outra compra e **pague**. Nos logs aparece `🔥 WEBHOOK RECEBIDO` (sem dados pessoais). No Telegram, `/panorama` conta a venda, e a conversa de recuperação aparece em `GET /jarvis/recuperacao`.
Eventos repetidos (a plataforma reenvia quando demora) são ignorados automaticamente.

## Fase 6: Os anúncios (Meta Ads)

1. Em **business.facebook.com → Configurações → Usuários do sistema**, crie um usuário do sistema (*Admin*) e dê a ele acesso à sua **conta de anúncios** e ao **app**.
2. **Gerar token** com as permissões `ads_read` e `ads_management` (marque para não expirar).
3. O ID da conta de anúncios está na URL do Gerenciador (`act=123456789`): use só os números.
4. No Railway: `META_ACCESS_TOKEN` e `META_AD_ACCOUNT_ID` (o `META_PIXEL_ID` você já usa).

✅ **Teste:** "Jarvis, como estão minhas campanhas hoje?". Ele deve trazer gasto, ROAS e CPA reais. Em modo supervisionado, qualquer ajuste que ele sugerir chega como pedido de aprovação com botões.

## Fase 7: A recuperação de PIX (WhatsApp oficial)

> Use um número de telefone **que não esteja** no aplicativo do WhatsApp (ou que você aceite migrar). Ele passa a ser da API.

1. Em **developers.facebook.com → Meus apps → Criar app** (tipo *Empresa/Business*) → adicione o produto **WhatsApp**.
2. Em *WhatsApp → Configuração da API*, adicione e verifique o seu número. Copie o **Phone number ID**.
3. **Token permanente:** no mesmo usuário do sistema da fase 6, gere um token com `whatsapp_business_messaging` e `whatsapp_business_management`.
4. **App secret:** *Configurações do app → Básico → Chave secreta do app*.
5. **Forma de pagamento:** no WhatsApp Manager, adicione um cartão (a Meta cobra por conversa iniciada pela empresa).
6. **Templates** (*WhatsApp Manager → Modelos de mensagem → Criar*), idioma **Português (BR)**, com duas variáveis, {{1}} = nome e {{2}} = produto:
   - `recuperacao_pix_1`: *"Oi {{1}}! Vi que você gerou o PIX do {{2}}, mas ele ainda não foi pago. Ficou alguma dúvida ou deu algum problema? Posso te ajudar por aqui 😊"*
   - `recuperacao_pix_2`: *"Oi {{1}}, passando só para saber se ainda posso te ajudar com o {{2}}. Se preferir não receber mais mensagens, é só responder PARAR."*

   Espere a aprovação (geralmente minutos a horas).
7. **Webhook:** em *WhatsApp → Configuração*, URL de callback `https://SEU-APP/jarvis/whatsapp/webhook`, token de verificação = uma senha que você inventar; depois clique em **Gerenciar** e assine o campo **messages**.
8. No Railway: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (a senha do passo 7), `META_APP_SECRET`.

✅ **Teste:** com o **seu** celular, gere um PIX e não pague. Em 15 minutos (entre 8h e 21h) chega o template. Responda "o pix expirou" e veja a atendente reenviar o PIX ou o link certo. Depois pague e veja ela agradecer. No Telegram, `/panorama` mostra a recuperação.

## Fase 8: A mineração de ofertas (Apify)

1. Crie a conta em **apify.com** e adicione um meio de pagamento (cobra por uso).
2. Procure na Store o ator **Facebook Ads Library Scraper** (`curious_coder/facebook-ads-library-scraper`); se ele pedir assinatura, assine.
3. *Settings → API & Integrations* → copie o **token**.
4. No Railway: `APIFY_TOKEN`.

✅ **Teste:** no Telegram, `/oportunidades` (mostra o calendário) e depois `/minerar confeitaria`. Em alguns minutos chegam as ofertas com nota de escala.
⚠️ Se aparecer erro de formato do Apify, mande o erro para o Claude ajustar a leitura.

## Fase 9: E-mail de suporte (opcional)

1. Em **resend.com**, crie a conta, adicione o seu domínio e configure os registros DNS que ele mostrar.
2. Crie uma **API key**.
3. No Railway: `RESEND_API_KEY` e `JARVIS_EMAIL_FROM` (ex.: `Suporte <suporte@seudominio.com.br>`).
4. Para os e-mails dos clientes chegarem ao JARVIS: crie uma automação (Zapier/Make/regra do Gmail) que envie cada e-mail recebido para `POST https://SEU-APP/jarvis/tickets` com o header `x-jarvis-token` e os campos `clienteEmail`, `clienteNome`, `assunto`, `mensagem`.

## Fase 10: Voz, música e ligar com o computador (opcional)

1. **Voz premium:** em **elevenlabs.io**, escolha na biblioteca uma voz masculina, calma, estilo mordomo britânico, que fale português (modelo *Multilingual v2*). Copie o **Voice ID** e a **API key** → Railway: `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID`. Não use clone da voz de ator nenhum.
2. **Atalho de inicialização:** baixe o arquivo do seu sistema em `jarvis/inicializacao/`, troque `SEU-APP` pelo seu endereço e siga as instruções no topo do arquivo (Windows: Win+R → `shell:startup` → coloque o arquivo lá).
3. **Primeira vez:** rode o atalho. Na janela que abrir: *configurações* → senha (`JARVIS_API_TOKEN`) → escolha sua **música** (arquivo MP3 seu) → Salvar → **Ativar** → permita o microfone.
4. **Estação 24h:** se quiser que ele escute o tempo todo, deixe um celular Android antigo, um tablet ou um PC com a central aberta, tela ligada e carregando (Chrome).

✅ **Teste:** reinicie o computador. A música toca, ele diz *"Online e à disposição, Senhor"*. Diga *"Jarvis, análise rápida"*.

## Fase 11: Soltar a autonomia

1. Use **1 a 2 semanas em `supervisionada`**. Aprove e rejeite pelos botões do Telegram e **responda "porque…"**: é assim que ele aprende a decidir como você.
2. Ajuste os limites no Railway quando estiver confortável: `JARVIS_MAX_ORCAMENTO_DIARIO`, `JARVIS_MAX_VARIACAO_ORCAMENTO_PCT`, `JARVIS_ROAS_MINIMO`.
3. Mande `/autonomia total` no Telegram.
4. **Botão de pânico:** `/pausar` congela tudo na hora; `/retomar` volta.

---

## Rotina depois de pronto

- **Todo dia às 8h:** relatório no Telegram.
- **Toda segunda às 7h:** mineração de ofertas da semana.
- **A cada 15 min:** vigilância; problema crítico chega na hora e ele já começa a investigar.
- **Sempre:** recuperação de PIX e atendimento no WhatsApp.

## Se algo não funcionar

| Sintoma | Onde olhar |
|---|---|
| Nada responde | Railway → Deployments → logs. `ANTHROPIC_API_KEY ausente` = variável faltando. |
| Bot não responde | `TELEGRAM_CHAT_ID` errado, ou você nunca mandou mensagem para o bot. Mais de uma réplica rodando. |
| Venda não aparece | Webhook da plataforma apontando para `/webhook`? Veja `🔥 WEBHOOK RECEBIDO` nos logs. |
| PIX não é recuperado | Plataforma não manda o evento de PIX gerado, ou o status tem outro nome (mande o log para o Claude). Template não aprovado. Fora do horário 8h–21h. |
| WhatsApp não chega | Template rejeitado, sem forma de pagamento, token expirado, ou webhook sem o campo *messages*. |
| Central não escuta | Use o Chrome, permita o microfone, deixe a página aberta na tela. |
| Música não toca ao ligar | Abra pelo atalho da pasta `inicializacao` (ele libera o som), e escolha a música dentro daquela janela. |
| Gasto de IA alto | `JARVIS_WORKER_MODEL=claude-sonnet-5-5` deixa os especialistas mais baratos; limite de gasto no console da Anthropic. |

**Importante:** este sistema foi testado em partes (compilação, lógica e telas com serviços simulados), mas **nunca rodou ligado aos serviços reais**. Espere pequenos ajustes na primeira semana, principalmente no formato do webhook da sua plataforma e no retorno do Apify. Quando algo falhar, mande o erro do log (sem dados de clientes) para o Claude.
