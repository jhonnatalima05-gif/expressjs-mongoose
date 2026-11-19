# JARVIS — agente-chefe da operação

> **Primeira vez? Comece pelo [passo a passo](PASSO-A-PASSO.md).**

O JARVIS é o "cabeça" da operação de infoprodutos. Ele vigia tudo, decide dentro dos limites que você define, comanda uma equipe de agentes especialistas e te manda o relatório diário — falando como um mordomo digital calmo e direto.

```
                     ┌──────────── VOCÊ (Telegram / API) ────────────┐
                     │   ordens, perguntas, aprovações, relatório    │
                     └───────────────────────┬───────────────────────┘
                                             │
   monitor (a cada 15 min) ──alerta──▶  J.A.R.V.I.S.  ◀── perfil-do-dono.md + memória
   relatório diário (8h)  ──────────▶  (agente-chefe)
                                             │ delega (em paralelo quando dá)
     ┌──────────────┬──────────────┬─────────┼─────────┬────────────────┬──────────────┐
 minerador_     gestor_       criador_    copywriter_   suporte_       estrategista
 ofertas        trafego       produto     paginas       clientes      (visão do alto)
 (web)          (Meta Ads)    (conteúdo)  (HTML)        (e-mail)       (cenários)
```

## Onde ele roda (sem deixar seu computador ligado)

O JARVIS não mora no seu computador: ele roda num **servidor na nuvem (Railway)**, ligado 24 horas por dia. Seu celular, PC, tablet ou navegador são só **controles remotos** pelo Telegram. Pode desligar o computador, viajar ou trocar de aparelho, e ele continua vigiando, decidindo e trabalhando.

```
 celular / PC / tablet ──Telegram──▶  servidor Railway (24h)  ──▶ Meta Ads, e-mail, vendas
                                       └─ JARVIS + 6 agentes + banco MongoDB
```

**Um cérebro só.** Todos os agentes (chefe e especialistas) usam o mesmo modelo de IA, o Claude, por uma única chave (`ANTHROPIC_API_KEY`). Não precisa de ChatGPT nem de outras IAs. O que ele usa de fora são apenas os **sistemas da sua operação** (Meta Ads, Telegram, e-mail e a plataforma de vendas), porque é ali que as ações acontecem.

## Central de voz: "Jarvis, ..."

Abra `https://SEU-APP.up.railway.app/jarvis/central` no **Google Chrome** (ou no Edge), informe a senha (`JARVIS_API_TOKEN`) e toque em **Ativar** uma vez. A partir daí é só falar:

- *"Jarvis, como estão as vendas hoje?"*: ele responde em voz alta.
- *"Jarvis"* (sozinho): ele responde *"Pois não, Senhor?"* e a próxima frase é a ordem.
- Conversa normal na sala, sem dizer "Jarvis", é ignorada.
- Alertas importantes ele fala sozinho: *"Senhor, alerta crítico…"*.
- Ele lembra dos últimos minutos de conversa, então dá para continuar: *"e ontem?"*, *"pode fazer"*.
- Tarefas demoradas (minerar, criar página) ele delega, avisa por voz e manda o resultado no Telegram.

**Música de abertura:** nas *configurações* da central, escolha um arquivo de música seu (MP3/M4A, por exemplo uma faixa que você comprou). Ele fica guardado só naquele aparelho, nunca vai para o servidor nem para o GitHub. Ela toca:
- quando a central liga: a música abre, depois de uns 6 segundos ele diz *"Online e à disposição, Senhor"* com a música baixinha por baixo, e ela termina em fade;
- quando você pede *"Jarvis, análise rápida"* (ou "status geral", "como está tudo"): a música toca enquanto ele levanta os números, ele dá o resumo por cima e a música sai em fade.

Dá para desligar cada uma e ajustar a duração. Músicas baixadas do Spotify/Apple Music não servem (são protegidas); use um arquivo de áudio comum.

**Ligar junto com o computador:** em `jarvis/inicializacao/` há um atalho para cada sistema (Windows, Mac, Linux). Troque `SEU-APP` pelo seu endereço e siga as 3 linhas no topo do arquivo. Ele abre a central numa janela própria do Chrome, já liberada para tocar som, e ela liga sozinha (`?auto=1`). Na primeira vez, nessa janela, toque em **Ativar**, permita o microfone e escolha a música; das próximas vezes é só ligar o computador.

**Para ficar atento 24h:** deixe um aparelho dedicado com a central aberta e a tela ligada, carregando: um celular Android antigo, um tablet ou um PC. A página impede a tela de apagar. Celulares cortam o microfone de páginas em segundo plano, então ela precisa ficar aberta na tela. No iPhone/Safari a escuta contínua é instável; prefira Android ou PC com Chrome.

**A voz:** por padrão ele usa a voz em português do aparelho. Para uma voz de qualidade, no estilo mordomo britânico, calma e refinada, crie uma conta na ElevenLabs, escolha uma voz masculina com esse perfil na biblioteca deles e preencha `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID`. **Não use clone da voz de um ator** (do filme ou da dublagem): copiar a voz de uma pessoa real sem autorização viola os termos dessas plataformas e o direito de imagem/voz dela.

## Controle pelo celular (Telegram)

Fale com ele como numa conversa: *"Jarvis, como foram as vendas hoje?"*, *"pausa o que estiver dando prejuízo"*, *"o que acontece se eu dobrar o orçamento?"*.

| Comando | O quê |
|---|---|
| `/panorama` | Como está a operação agora |
| `/relatorio` | Relatório completo na hora |
| `/oportunidades` | Calendário: o que está em alta e o que preparar |
| `/minerar [nicho]` | Minerar ofertas na Biblioteca agora |
| `/alertas` | Problemas em aberto |
| `/aprovacoes` | Pedidos com botões ✅ Aprovar / ❌ Rejeitar |
| `/autonomia total` | Ele decide e executa sozinho (dentro dos limites) |
| `/autonomia supervisionada` | Ele prepara e você aprova |
| `/pausar` · `/retomar` | Botão de pânico: congela/retoma todas as ações automáticas |

Depois de aprovar ou rejeitar, responda *"porque ..."* e ele guarda o motivo para decidir como você da próxima vez. Por segurança, o bot **só obedece ao seu chat** (`TELEGRAM_CHAT_ID`); mensagens de qualquer outra pessoa são ignoradas.

## Colocando no ar (uma vez só)

1. Railway: abra o projeto onde este repositório já está implantado (ou *New Project → Deploy from GitHub*) e adicione um banco **MongoDB** no mesmo projeto.
2. Em *Variables*, preencha no mínimo: `ANTHROPIC_API_KEY`, `MONGO_URL`, `JARVIS_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Depois: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `RESEND_API_KEY`, `JARVIS_EMAIL_FROM`.
3. Faça o deploy deste branch. No log deve aparecer `🧠 JARVIS online` e `📱 Controle pelo Telegram ativo`.
4. No Telegram, mande `/start` para o seu bot.
5. Preencha `jarvis/perfil-do-dono.md` e faça um novo deploy.

Rode **uma única instância** do servidor: duas cópias ao mesmo tempo disputariam as mensagens do Telegram. Para testar no seu PC, pare a da nuvem antes.

## Mineração de ofertas por época do ano

O minerador trabalha em 4 passos:

1. **Calendário** (`jarvis/calendario-sazonal.json`): o que está **no ar agora** (🟢), o que é preciso **preparar agora** para chegar pronto no pico (🟡) e o que vem depois (⚪). Cada janela traz os nichos, os ângulos e o custo de anúncio da época (ex.: janeiro barato para escalar, Black Friday cara para testar).
2. **Biblioteca de Anúncios:** busca os nichos priorizados e mede, com números, quem está escalando: dias no ar, anúncios ativos, criativos novos na semana e variações de copy. Isso vira uma **nota de escala de 0 a 10** calculada por fórmula (não é "achismo" da IA): *escalada* (≥7), *validando* (4–6,9), *teste* (<4).
3. **Cruzamento:** escala comprovada × momento do ano × concorrência × o seu perfil. Uma oferta validando cuja época abre em 30 dias pode valer mais do que uma escalada cuja época está acabando.
4. **Modelagem:** para as melhores, ele monta a **sua versão** da oferta (avatar, promessa com outro ângulo, mecanismo, entregáveis, preço, bônus, garantia, 3 ângulos de criativo) com cronograma: pronta até X, testar de X a Y, escalar no pico. Ele usa o que funciona como inspiração, nunca copia texto, marca ou criativo de ninguém.

Roda sozinho **toda segunda às 7h** e manda as 3 melhores oportunidades no Telegram. Na hora: `/minerar` ou `/minerar confeitaria`. Para ver o calendário: `/oportunidades`.

**Fonte dos anúncios (importante):** a API oficial da Biblioteca da Meta **não entrega anúncios comerciais veiculados no Brasil**, só políticos (os comerciais ela só entrega da Europa). Por isso a fonte principal para o Brasil é o **Apify**, um serviço pago por uso que lê a Biblioteca pública: crie uma conta, pegue o token e coloque em `APIFY_TOKEN`. Sem ele, o minerador avisa e usa a pesquisa na web como fonte mais fraca.

## Recuperação de PIX e vendas no WhatsApp

Quando alguém gera um PIX e não paga, o JARVIS entra em ação sozinho:

1. **Detecta** pelo webhook da plataforma (status "aguardando pagamento" com método PIX) e guarda nome, telefone, produto, valor e o código copia-e-cola.
2. **Espera** 15 min (o cliente pode pagar sozinho). Pagou → nada acontece.
3. **Primeiro contato** no WhatsApp com um template aprovado, ex.: *"Oi {{1}}! Vi que você gerou o PIX do {{2}} mas ele ainda não foi pago. Ficou alguma dúvida ou deu algum problema? Posso te ajudar por aqui 😊"*. Se não responder, um 2º contato em 4h. Só entre 8h e 21h.
4. **Cliente respondeu** → a *closer* conduz a conversa como uma pessoa da equipe: entende o que travou, tira dúvidas, contorna objeções com a verdade e envia **o link certo do catálogo** conforme a conversa (PIX expirou → reenvia o PIX; sem saldo → link do cartão; achou caro mesmo assim → versão menor).
5. **Pagou** → a conversa vira "convertida", ela agradece e os contatos param. O valor entra como *recuperado* no relatório.
6. **Cliente pediu para parar** ("parar", "sair") → nunca mais recebe mensagem. Irritado, reclamação, ou pediu uma pessoa → ela passa para você e você recebe alerta no Telegram.

Clientes que chamarem no WhatsApp por conta própria também são atendidos pela closer.

**Regras que ela segue:** só envia links que estão em `jarvis/catalogo.json` (nunca inventa link, preço ou desconto), não usa escassez falsa, não promete resultado, e se perguntarem se é robô, ela não mente: diz que é a assistente virtual e oferece chamar alguém.

### Configurando

1. **Catálogo:** edite `jarvis/catalogo.json` com suas ofertas reais: link de cada checkout, quando usar cada um, respostas verdadeiras para as objeções e o nome da atendente.
2. **WhatsApp Cloud API** (Meta for Developers → app → WhatsApp): pegue o token permanente e o *Phone number ID*. No número, crie e aprove os templates `recuperacao_pix_1` e `recuperacao_pix_2` (categoria *Utilidade* ou *Marketing*, com as variáveis {{1}} = nome e {{2}} = produto).
3. Webhook da Meta: URL `https://SEU-APP.up.railway.app/jarvis/whatsapp/webhook`, token de verificação = `WHATSAPP_VERIFY_TOKEN`, assine o campo **messages**.
4. Confira se a sua plataforma (Ticto/Cakto/Kiwify) manda o webhook também do **PIX gerado**, não só do aprovado. Se os nomes de status forem diferentes, ajuste `STATUS_AGUARDANDO` em `src/jarvis/recovery.ts`.

Por que a API oficial e não uma "API de WhatsApp" não oficial: as não oficiais (que conectam pelo QR code) costumam ter o número **banido** quando mandam mensagens automáticas para quem não salvou o contato. A oficial exige templates no primeiro contato, mas não derruba o seu número.

Acompanhe em `/panorama` no Telegram, no relatório diário, ou em `GET /jarvis/recuperacao`.

## O que cada um faz

| Agente | Faz | Ferramentas |
|---|---|---|
| **jarvis** | Entende a situação, consulta seu jeito de pensar, decide, delega, junta resultados, alerta e reporta | panorama, vendas, delegar, alertas, decisões, memória do dono, Telegram |
| **minerador_ofertas** | Acha ofertas escaladas (anúncios rodando há semanas, muitos criativos, marketplaces) e dá nota | busca e leitura na web, salvar oferta |
| **gestor_trafego** | Lê métricas da Meta, pausa o que queima caixa, escala o que dá lucro | métricas, pausar, ativar, ajustar orçamento |
| **criador_produto** | Cria o produto: estrutura, módulos, conteúdo, bônus, prompts para IAs de imagem/vídeo | web, salvar em `output/produtos` |
| **copywriter_paginas** | Escreve página de vendas completa em HTML e criativos | web, salvar em `output/paginas` (servida em `/jarvis/paginas/<arquivo>`) |
| **suporte_clientes** | Lê tickets, responde, classifica, encaminha reembolso, detecta erro em massa | tickets, responder por e-mail, reembolso, alerta |
| **estrategista** | "Visão do alto": projeta 7/30 dias se nada mudar, se a decisão for tomada, e o pior caso | panorama, vendas, métricas |

## Funcionamento automático

- **A cada 15 min** o monitor checa (sem gastar IA): ROAS baixo com gasto relevante, erro na conta de anúncios, horas sem venda, excesso de transações recusadas, clientes sem resposta, falha no envio do evento de compra para a Meta.
- **Alerta crítico novo** → você recebe no Telegram **e** o JARVIS acorda sozinho para investigar, acionar os especialistas e resolver o que estiver na autonomia dele.
- **Ticket novo** → o agente de suporte atende.
- **Todo dia às 8h** → relatório: números, o que foi feito e por quê, problemas, aprovações pendentes, projeção e 3 recomendações.
- **Toda venda** que chega no `/webhook` (já existente) fica registrada para o JARVIS acompanhar.

## Limites de autonomia (segurança do seu dinheiro)

- Troque a qualquer momento pelo celular com `/autonomia total` ou `/autonomia supervisionada` (fica salvo). A variável `JARVIS_AUTONOMIA` é só o valor inicial.
- `/pausar` congela tudo na hora: ele continua vigiando e avisando, mas não executa nada.
- `supervisionada` (padrão): ele analisa e prepara tudo, mas gastar dinheiro e responder cliente esperam seu "sim".
- `total`: ele age sozinho **dentro** dos limites: orçamento até `JARVIS_MAX_ORCAMENTO_DIARIO`, variação até `JARVIS_MAX_VARIACAO_ORCAMENTO_PCT`% por ajuste. Ativar campanha e reembolso acima do limite sempre pedem aprovação.
- Toda ação fica no diário de decisões (`GET /jarvis/decisoes`).

Recomendo começar em **supervisionada** por 1–2 semanas: cada vez que você aprova ou rejeita com um motivo, isso vira memória e ele passa a decidir mais parecido com você. Depois mude para **total**.

## Como ele aprende a pensar como você

1. `jarvis/perfil-do-dono.md` — você escreve suas regras, metas e estilo. **Preencha isso primeiro.**
2. Memória — cada aprovação/rejeição com motivo, e cada correção sua no chat, vira um aprendizado (`GET /jarvis/memoria`).

## Configuração

1. Copie `.env.example` e preencha no Railway (Variables). Mínimo: `ANTHROPIC_API_KEY`, `JARVIS_API_TOKEN`, `MONGO_URL`.
2. Telegram: crie um bot no @BotFather, mande uma mensagem para ele, pegue seu chat id no @userinfobot.
3. Meta: `META_ACCESS_TOKEN` com `ads_read` + `ads_management`, e `META_AD_ACCOUNT_ID`.
4. E-mail de clientes: encaminhe os e-mails de suporte (Zapier/Make/Gmail) para `POST /jarvis/tickets`. Respostas saem pelo Resend.
5. `yarn && yarn dev`.

## Usando a API

Todas as rotas exigem o header `x-jarvis-token: <JARVIS_API_TOKEN>` (exceto `/jarvis/paginas/*`).

```bash
# Conversar / dar ordens
curl -X POST $URL/jarvis/chat -H "x-jarvis-token: $T" -H "Content-Type: application/json" \
  -d '{"mensagem":"Jarvis, minere 5 ofertas escaladas no nicho de emagrecimento e crie a página da melhor"}'

# Visão do alto
curl -X POST $URL/jarvis/chat -H "x-jarvis-token: $T" -H "Content-Type: application/json" \
  -d '{"mensagem":"O que acontece em 30 dias se eu dobrar o orçamento da campanha X?"}'

# Falar direto com um especialista
curl -X POST $URL/jarvis/agentes/criador_produto -H "x-jarvis-token: $T" -H "Content-Type: application/json" \
  -d '{"tarefa":"Crie um e-book de 10 capítulos sobre ..."}'

# Aprovar / rejeitar (o motivo vira aprendizado)
curl -X POST $URL/jarvis/aprovacoes/<id>/aprovar  -H "x-jarvis-token: $T" -H "Content-Type: application/json" -d '{"motivo":"campanha validada há 5 dias"}'
curl -X POST $URL/jarvis/aprovacoes/<id>/rejeitar -H "x-jarvis-token: $T" -H "Content-Type: application/json" -d '{"motivo":"não escalo em fim de semana"}'
```

| Rota | O quê |
|---|---|
| `POST /jarvis/chat` | Fala com o JARVIS |
| `POST /jarvis/agentes/:nome` | Fala direto com um especialista |
| `GET /jarvis/panorama` | Estado da operação agora |
| `POST /jarvis/relatorio` · `GET /jarvis/relatorios` | Gera agora / histórico |
| `GET /jarvis/alertas` | Problemas abertos (`?todos=1` inclui resolvidos) |
| `GET /jarvis/aprovacoes` · `POST /jarvis/aprovacoes/:id/aprovar\|rejeitar` | Fila de aprovação |
| `GET /jarvis/decisoes` | Diário de decisões |
| `GET /jarvis/ofertas` | Ofertas mineradas |
| `POST /jarvis/tickets` | Entrada de mensagem de cliente |
| `GET/POST /jarvis/memoria` | Memória do dono |
| `GET /jarvis/paginas/:arquivo` | Páginas de vendas geradas (público) |

## Custos

Cada conversa e cada execução de agente consome tokens da API do Claude. O monitor só usa IA quando surge algo novo. Para baratear, defina `JARVIS_WORKER_MODEL=claude-sonnet-5-5` (especialistas mais baratos) mantendo o chefe no Opus.

## Próximos passos sugeridos

- Integração com a API da plataforma de pagamento (Cakto/Ticto) para reembolso e dados de vendas completos.
- Geração de imagens/vídeos de criativos com IAs de imagem.
- Painel web com o panorama, alertas e aprovações.
