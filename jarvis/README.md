# JARVIS — agente-chefe da operação

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

- `JARVIS_AUTONOMIA=supervisionada` (padrão): ele analisa e prepara tudo, mas gastar dinheiro e responder cliente esperam seu "sim".
- `JARVIS_AUTONOMIA=total`: ele age sozinho **dentro** dos limites: orçamento até `JARVIS_MAX_ORCAMENTO_DIARIO`, variação até `JARVIS_MAX_VARIACAO_ORCAMENTO_PCT`% por ajuste. Ativar campanha e reembolso acima do limite sempre pedem aprovação.
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

- Comandos e aprovações direto pelo Telegram (responder "aprovar" no chat) em vez de curl.
- Integração com a API da plataforma de pagamento (Cakto/Ticto) para reembolso e dados de vendas completos.
- Geração de imagens/vídeos de criativos com IAs de imagem.
- Painel web com o panorama, alertas e aprovações.
