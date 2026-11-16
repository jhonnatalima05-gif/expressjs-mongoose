// Recuperação de PIX e atendimento de vendas no WhatsApp.
//
// 1. O webhook avisa que um PIX foi gerado → registramos e agendamos o contato.
// 2. Se não pagar até o prazo, mandamos o 1º contato (template aprovado do WhatsApp).
// 3. Quando o cliente responde, a "closer" (agente de vendas) conduz a conversa:
//    tira dúvidas, quebra objeções com a verdade e envia o link CERTO do catálogo.
// 4. Pagou → conversa marcada como convertida e os contatos param. Pediu para parar → para.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "./config";
import { ConversationModel, SaleModel } from "./models";
import { buscarOferta, lerCatalogo, produtoDaVenda } from "./catalog";
import * as wa from "./integrations/whatsapp";
import { enviarEmail } from "./integrations/email";
import { alertar } from "./alerts";
import { perfilDoDono } from "./persona";
import { rodarAgente } from "./agents/runtime";

const lista = (v: string | undefined, padrao: string) =>
  (v || padrao).split(",").map((s) => s.trim()).filter(Boolean);

export const recuperacaoConfig = {
  ativa: process.env.JARVIS_RECUPERACAO !== "false",
  // Minutos após o PIX gerado para cada tentativa de contato sem resposta.
  atrasosMin: lista(process.env.JARVIS_RECUPERACAO_MINUTOS, "15,240").map(Number).filter((n) => n > 0),
  // Templates aprovados na Meta, um por tentativa. Parâmetros: {{1}} = primeiro nome, {{2}} = produto.
  templates: lista(process.env.WHATSAPP_TEMPLATES_RECUPERACAO, "recuperacao_pix_1,recuperacao_pix_2"),
  idiomaTemplate: process.env.WHATSAPP_TEMPLATE_IDIOMA || "pt_BR",
  // Só faz contato ativo dentro deste horário (respostas a quem chamou saem a qualquer hora).
  horaInicio: Number(process.env.JARVIS_CONTATO_HORA_INICIO || 8),
  horaFim: Number(process.env.JARVIS_CONTATO_HORA_FIM || 21),
  followupSilencioMin: Number(process.env.JARVIS_FOLLOWUP_SILENCIO_MIN || 180),
  diasParaDesistir: Number(process.env.JARVIS_RECUPERACAO_DIAS || 3),
};

const primeiroNome = (nome?: string | null) => (nome || "").trim().split(/\s+/)[0] || "tudo bem";
const OPT_OUT = /^\s*(parar|pare|sair|stop|n[aã]o quero mais|cancelar mensagens|me tira|remover)\b/i;

function horaLocal(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: config.relatorio.timezone, hour: "numeric", hour12: false }).format(d)) % 24;
}

function dentroDoHorario(d = new Date()) {
  const h = horaLocal(d);
  return h >= recuperacaoConfig.horaInicio && h < recuperacaoConfig.horaFim;
}

function proximoHorarioPermitido(d = new Date()) {
  const t = new Date(d);
  while (!dentroDoHorario(t)) t.setTime(t.getTime() + 15 * 60_000);
  return t;
}

const janelaAberta = (c: any) =>
  Boolean(c.ultimaMensagemClienteEm && Date.now() - new Date(c.ultimaMensagemClienteEm).getTime() < wa.JANELA_24H_MS - 5 * 60_000);

async function pagou(c: any): Promise<any | null> {
  const ou: any[] = [];
  if (c.email) ou.push({ clienteEmail: c.email });
  if (c.telefone) ou.push({ clienteTelefone: c.telefone });
  if (!ou.length) return null;
  return SaleModel.findOne({ aprovada: true, createdAt: { $gte: c.createdAt }, $or: ou }).lean();
}

// ---------------------------------------------------------------- entradas

// Ajuste estas listas ao texto exato que a sua plataforma manda no webhook.
const STATUS_APROVADO = ["authorized", "approved", "paid", "completed", "finished", "realized", "venda_realizada"];
const STATUS_AGUARDANDO = [
  "waiting_payment", "waiting", "pending", "pending_payment", "pix_generated", "pix_created", "pix_gerado",
  "generated", "created", "aguardando_pagamento", "aguardando pagamento", "aguardando",
];

export function classificarTransacao(status: string, metodo: string): "aprovada" | "pix_pendente" | "outro" {
  const s = status.toLowerCase().trim();
  if (STATUS_APROVADO.includes(s)) return "aprovada";
  if (/pix/i.test(metodo) && STATUS_AGUARDANDO.includes(s)) return "pix_pendente";
  return "outro";
}

// Procura o código copia-e-cola e o link do PIX nos lugares mais comuns dos payloads.
export function extrairPix(body: any): { pixCodigo?: string; pixLink?: string } {
  const p = body?.pix || body?.payment?.pix || body?.order?.pix || {};
  const codigo =
    body?.pix_code || body?.pix_qrcode || body?.qr_code || body?.pix_copy_paste ||
    p.code || p.qrcode || p.qr_code || p.copy_paste || p.emv || p.payload ||
    body?.payment?.pix_code || body?.payment?.qrcode || body?.order?.pix_code;
  const link = body?.pix_url || p.url || p.link || body?.payment_url || body?.payment?.url || body?.order?.payment_url;
  return {
    pixCodigo: typeof codigo === "string" && codigo.length > 20 ? codigo : undefined,
    pixLink: typeof link === "string" && /^https?:\/\//.test(link) ? link : undefined,
  };
}

export type PixPendente = {
  nome?: string;
  email?: string;
  telefone?: string;
  produto?: string;
  valor?: number;
  pixCodigo?: string;
  pixLink?: string;
};

export async function registrarPixPendente(p: PixPendente) {
  if (!recuperacaoConfig.ativa) return;
  const telefone = wa.normalizarTelefone(p.telefone);
  const email = p.email?.toLowerCase().trim();
  if (!telefone && !email) return;

  // Mesmo cliente com conversa recente em andamento: só atualiza o PIX (ele pode ter gerado outro).
  const desde = new Date(Date.now() - recuperacaoConfig.diasParaDesistir * 86400_000);
  const existente = await ConversationModel.findOne({
    createdAt: { $gte: desde },
    status: { $in: ["aguardando", "contatado", "em_conversa"] },
    $or: [...(telefone ? [{ telefone }] : []), ...(email ? [{ email }] : [])],
  });
  if (existente) {
    Object.assign(existente, { pixCodigo: p.pixCodigo || existente.pixCodigo, pixLink: p.pixLink || existente.pixLink, valor: p.valor ?? existente.valor });
    existente.mensagens.push({ de: "sistema", texto: "Cliente gerou um novo PIX." } as any);
    await existente.save();
    return;
  }

  const bloqueado = await ConversationModel.exists({ status: "nao_contatar", $or: [...(telefone ? [{ telefone }] : []), ...(email ? [{ email }] : [])] });
  if (bloqueado) return;

  await ConversationModel.create({
    origem: "pix_pendente",
    canal: telefone && wa.whatsappConfigurado() ? "whatsapp" : "email",
    telefone,
    email,
    nome: p.nome,
    produto: produtoDaVenda(p.produto) || p.produto,
    valor: p.valor,
    pixCodigo: p.pixCodigo,
    pixLink: p.pixLink,
    status: "aguardando",
    proximoContatoEm: new Date(Date.now() + (recuperacaoConfig.atrasosMin[0] ?? 15) * 60_000),
    mensagens: [{ de: "sistema", texto: `PIX gerado de ${p.produto || "produto"} (R$${p.valor ?? "?"}).` }],
  });
}

export async function registrarPagamento(p: { email?: string; telefone?: string; valor?: number }) {
  const telefone = wa.normalizarTelefone(p.telefone);
  const email = p.email?.toLowerCase().trim();
  const ou = [...(telefone ? [{ telefone }] : []), ...(email ? [{ email }] : [])];
  if (!ou.length) return;
  const convs = await ConversationModel.find({
    status: { $in: ["aguardando", "contatado", "em_conversa", "humano"] },
    createdAt: { $gte: new Date(Date.now() - 7 * 86400_000) },
    $or: ou,
  });
  for (const c of convs) {
    const houveContato = c.tentativas > 0 || c.status === "em_conversa";
    c.status = "convertido";
    c.valorRecuperado = houveContato ? p.valor ?? c.valor : 0; // só conta como recuperado se houve contato
    c.proximoContatoEm = undefined;
    c.mensagens.push({ de: "sistema", texto: "Pagamento aprovado." } as any);
    await c.save();
    if (houveContato && c.canal === "whatsapp" && c.telefone && janelaAberta(c)) {
      const msg = `Pagamento confirmado, ${primeiroNome(c.nome)}! 🎉 O acesso chega no seu e-mail em instantes (dá uma olhada no spam também). Qualquer coisa, é só me chamar aqui.`;
      await wa.enviarTexto(c.telefone, msg).catch(() => undefined);
      c.mensagens.push({ de: "agente", texto: msg } as any);
      await c.save();
    }
  }
}

// Mensagens que chegam do WhatsApp. Agrupa mensagens em sequência (o cliente costuma mandar várias).
const pendentes = new Map<string, NodeJS.Timeout>();

export async function receberMensagemWhatsApp(m: wa.MensagemRecebida) {
  const telefone = wa.normalizarTelefone(m.telefone) || m.telefone;
  let conv = await ConversationModel.findOne({ telefone }).sort({ updatedAt: -1 });
  const antiga = conv && Date.now() - new Date((conv as any).updatedAt).getTime() > 7 * 86400_000;
  if (!conv || antiga || conv.status === "perdido") {
    conv = await ConversationModel.create({
      origem: conv && !antiga ? conv.origem : "cliente_iniciou",
      canal: "whatsapp",
      telefone,
      nome: m.nome || conv?.nome,
      email: conv?.email,
      produto: conv?.produto,
      valor: conv?.valor,
      pixCodigo: conv?.pixCodigo,
      pixLink: conv?.pixLink,
      status: "em_conversa",
      mensagens: [],
    });
  }

  conv.mensagens.push({ de: "cliente", texto: m.texto } as any);
  conv.ultimaMensagemClienteEm = new Date();
  if (!conv.nome && m.nome) conv.nome = m.nome;

  if (OPT_OUT.test(m.texto)) {
    conv.status = "nao_contatar";
    conv.proximoContatoEm = undefined;
    const msg = "Tudo certo, não vou mais te mandar mensagens. Se precisar de algo, é só chamar. 🙏";
    await wa.enviarTexto(telefone, msg).catch(() => undefined);
    conv.mensagens.push({ de: "agente", texto: msg } as any);
    await conv.save();
    return;
  }

  if (["aguardando", "contatado"].includes(conv.status)) conv.status = "em_conversa";
  conv.proximoContatoEm = undefined; // o cliente falou: nada de contato automático por cima
  await conv.save();

  if (conv.status === "humano" || config.pausado) {
    await alertar({
      chave: `wa-humano-${conv.id}-${conv.mensagens.length}`,
      nivel: "atencao",
      area: "vendas",
      titulo: `Cliente ${conv.nome || telefone} mandou mensagem (${conv.status === "humano" ? "atendimento humano" : "JARVIS pausado"})`,
      detalhe: m.texto.slice(0, 500),
    });
    return;
  }

  const id = conv.id;
  clearTimeout(pendentes.get(id));
  pendentes.set(
    id,
    setTimeout(() => {
      pendentes.delete(id);
      void rodarCloser(id, "O cliente acabou de mandar mensagem. Leia a conversa e responda.");
    }, Number(process.env.JARVIS_AGRUPAR_MENSAGENS_SEG || 8) * 1000)
  );
}

// ---------------------------------------------------------------- envio

async function enviarAoCliente(conv: any, texto: string) {
  if (conv.canal === "whatsapp") {
    if (!conv.telefone) throw new Error("Conversa sem telefone.");
    if (!janelaAberta(conv)) {
      throw new Error("Fora da janela de 24h do WhatsApp: só é possível mandar template. Não envie agora.");
    }
    await wa.enviarTexto(conv.telefone, texto);
  } else {
    if (!conv.email) throw new Error("Conversa sem e-mail.");
    await enviarEmail(conv.email, `Sobre o seu pedido${conv.produto ? ` — ${conv.produto}` : ""}`, texto);
  }
  conv.mensagens.push({ de: "agente", texto });
  await conv.save();
}

// ---------------------------------------------------------------- agente closer

function ferramentasCloser(convId: string) {
  const carregar = async () => {
    const c = await ConversationModel.findById(convId);
    if (!c) throw new Error("Conversa não encontrada.");
    return c;
  };

  return [
    betaZodTool({
      name: "enviar_mensagem",
      description:
        "Envia UMA mensagem curta ao cliente (um balão de WhatsApp). Para parecer conversa de gente, prefira 1 a 3 mensagens curtas a um textão.",
      inputSchema: z.object({ texto: z.string().min(1).max(1200) }),
      run: async ({ texto }) => {
        const c = await carregar();
        if (["nao_contatar"].includes(c.status)) return "Cliente pediu para não ser contatado. Não envie.";
        await enviarAoCliente(c, texto);
        return "Enviada.";
      },
    }),
    betaZodTool({
      name: "enviar_link_oferta",
      description:
        "Envia o link de pagamento de uma oferta do catálogo, com uma frase antes. É a ÚNICA forma de mandar link: nunca escreva links por conta própria.",
      inputSchema: z.object({ oferta_id: z.string(), mensagem: z.string().max(600) }),
      run: async ({ oferta_id, mensagem }) => {
        const oferta = buscarOferta(oferta_id);
        if (!oferta) return `Oferta "${oferta_id}" não existe no catálogo. Use um id válido.`;
        const c = await carregar();
        await enviarAoCliente(c, `${mensagem}\n\n${oferta.link}`);
        c.ofertasEnviadas.push(oferta.id);
        await c.save();
        return `Link de ${oferta.id} enviado.`;
      },
    }),
    betaZodTool({
      name: "reenviar_pix",
      description: "Reenvia o código PIX copia-e-cola que o cliente já gerou (numa mensagem separada, fácil de copiar).",
      inputSchema: z.object({ mensagem_antes: z.string().max(400) }),
      run: async ({ mensagem_antes }) => {
        const c = await carregar();
        if (c.pixCodigo) {
          await enviarAoCliente(c, mensagem_antes);
          await enviarAoCliente(c, c.pixCodigo);
          return "PIX reenviado. (Pode ter expirado; se o cliente disser que não funciona, envie o link da oferta para gerar outro.)";
        }
        if (c.pixLink) {
          await enviarAoCliente(c, `${mensagem_antes}\n\n${c.pixLink}`);
          return "Link do PIX reenviado.";
        }
        return "Não tenho o código deste PIX. Envie o link da oferta (enviar_link_oferta) para o cliente gerar um novo.";
      },
    }),
    betaZodTool({
      name: "verificar_pagamento",
      description: "Confere se o pagamento deste cliente já foi aprovado.",
      inputSchema: z.object({}),
      run: async () => {
        const c = await carregar();
        const venda = await pagou(c);
        if (venda) {
          await registrarPagamento({ email: c.email || undefined, telefone: c.telefone || undefined, valor: venda.valor ?? undefined });
          return "Pagamento APROVADO. Já avisei o cliente (se a janela estiver aberta). Não mande mais oferta.";
        }
        return "Ainda não consta pagamento aprovado. (Pode levar alguns minutos para cair.)";
      },
    }),
    betaZodTool({
      name: "encerrar_conversa",
      description: "Marca a conversa como perdida (cliente desistiu de vez) ou como 'não contatar' (pediu para não receber mensagens).",
      inputSchema: z.object({ status: z.enum(["perdido", "nao_contatar"]), motivo: z.string() }),
      run: async ({ status, motivo }) => {
        const c = await carregar();
        c.status = status;
        c.proximoContatoEm = undefined;
        c.notas = motivo;
        await c.save();
        return "Ok.";
      },
    }),
    betaZodTool({
      name: "chamar_humano",
      description:
        "Passa a conversa para o dono/equipe: cliente irritado, ameaça de reclamação/Procon, pedido fora do catálogo, problema técnico que você não resolve, ou cliente pediu para falar com uma pessoa.",
      inputSchema: z.object({ motivo: z.string() }),
      run: async ({ motivo }) => {
        const c = await carregar();
        c.status = "humano";
        c.proximoContatoEm = undefined;
        await c.save();
        await alertar({
          chave: `wa-humano-${c.id}`,
          nivel: "critico",
          area: "vendas",
          titulo: `Cliente ${c.nome || c.telefone} precisa de um humano`,
          detalhe: `${motivo}\nWhatsApp: ${c.telefone || "-"} | E-mail: ${c.email || "-"}`,
        });
        return "Dono avisado. Diga ao cliente que alguém da equipe vai falar com ele em breve.";
      },
    }),
  ];
}

function systemCloser(c: any) {
  const cat = lerCatalogo();
  const at = cat.atendente || {};
  const ofertas = cat.ofertas.map((o) => ({ ...o, _doProdutoDoCliente: c.produto && o.produto === c.produto }));
  return `Você é ${at.nome || "a atendente"}, da ${at.empresa || "equipe"}, falando com um cliente pelo ${c.canal === "whatsapp" ? "WhatsApp" : "e-mail"}.
Seu objetivo: ajudar o cliente a concluir a compra que ele mesmo começou, resolvendo de verdade o que o travou. Converter é consequência de atender bem.

## Como falar (humanizado)
- Português do Brasil, natural, como uma pessoa simpática da equipe no WhatsApp. Frases curtas. Use o primeiro nome. Emoji com moderação (no máximo um por mensagem, e nem sempre).
- Nada de "Prezado", textão, listas formais, nem linguagem de robô. Uma ideia por mensagem; 1 a 3 mensagens por resposta.
- Primeiro entenda: pergunte o que aconteceu ("ficou alguma dúvida?", "deu algum problema no pagamento?"). Ouça antes de oferecer.
- Responda exatamente o que o cliente perguntou. Depois, conduza com UMA pergunta ou UM próximo passo claro.
- Se o cliente perguntar se está falando com um robô ou com uma pessoa, NUNCA minta: diga que é a assistente virtual da equipe e que pode chamar alguém se ele preferir.

## Escolhendo a oferta certa
- Links: só pelo enviar_link_oferta, com ids do catálogo abaixo. Nunca escreva um link por conta própria, nunca invente desconto, preço, bônus ou condição que não esteja no catálogo.
- Siga o "quandoUsar" de cada oferta: PIX expirou → reenvie o PIX ou o link principal; sem saldo/prefere cartão → link do cartão; achou caro mesmo após explicar → aí sim o downsell. Não pule direto para a oferta mais barata.
- Não reenvie o mesmo link sem motivo. Já enviados nesta conversa: ${(c.ofertasEnviadas || []).join(", ") || "nenhum"}.
- Antes de reenviar oferta para quem diz que já pagou, use verificar_pagamento.

## Limites (inegociáveis)
- Sem pressão, sem escassez falsa, sem prometer resultado. Use a garantia como segurança real.
- Cliente disse que não quer, ou pediu para parar: agradeça, encerre (encerrar_conversa) e não insista.
- No máximo 2 tentativas de contornar a mesma objeção.
- Irritação, reclamação, pedido de reembolso de compra já feita, assunto fora do catálogo, ou pedido por um humano: chamar_humano.
- Se não houver nada útil a dizer (ex.: cliente só mandou "ok" depois de tudo resolvido), pode não enviar nada.

## Catálogo de ofertas (JSON)
${JSON.stringify(ofertas, null, 1)}

## Contexto do dono
${perfilDoDono()}`;
}

function transcricao(c: any) {
  return (c.mensagens || [])
    .slice(-40)
    .map((m: any) => {
      const quem = m.de === "cliente" ? "CLIENTE" : m.de === "agente" ? "VOCÊ" : "SISTEMA";
      return `[${new Date(m.em).toLocaleString("pt-BR", { timeZone: config.relatorio.timezone })}] ${quem}: ${m.texto}`;
    })
    .join("\n");
}

const travas = new Map<string, Promise<unknown>>();

export function rodarCloser(convId: string, gatilho: string): Promise<unknown> {
  const anterior = travas.get(convId) || Promise.resolve();
  const atual = anterior.then(async () => {
    const c: any = await ConversationModel.findById(convId);
    // Convertido ainda é atendido (ex.: dúvida de acesso); quem pediu para parar ou está com humano, não.
    if (!c || c.status === "nao_contatar" || c.status === "humano") return;

    const fatos = [
      `Cliente: ${c.nome || "(sem nome)"} | WhatsApp: ${c.telefone || "-"} | E-mail: ${c.email || "-"}`,
      `Origem: ${c.origem === "pix_pendente" ? "gerou PIX e não pagou" : "cliente chamou no WhatsApp"}`,
      `Produto: ${c.produto || "não identificado"} | Valor: ${c.valor != null ? `R$${c.valor}` : "?"}`,
      `Código PIX guardado: ${c.pixCodigo ? "sim" : "não"} | Status: ${c.status}`,
      c.canal === "whatsapp" ? `Janela de 24h: ${janelaAberta(c) ? "ABERTA (pode mandar mensagem livre)" : "FECHADA (não dá para mandar mensagem livre)"}` : "Canal: e-mail",
    ].join("\n");

    try {
      await rodarAgente({
        nome: `closer:${c.telefone || c.email}`,
        model: config.workerModel,
        system: systemCloser(c),
        tools: ferramentasCloser(convId),
        prompt: `${fatos}\n\n## Conversa até agora\n${transcricao(c) || "(nenhuma mensagem ainda)"}\n\n## Agora\n${gatilho}`,
        effort: "medium",
        maxIteracoes: 10,
      });
      const depois: any = await ConversationModel.findById(convId);
      // Cliente sumiu no meio da conversa: um único follow-up leve, ainda dentro da janela.
      if (depois && depois.status === "em_conversa" && depois.followups < 1 && depois.canal === "whatsapp") {
        depois.proximoContatoEm = new Date(Date.now() + recuperacaoConfig.followupSilencioMin * 60_000);
        await depois.save();
      }
    } catch (err: any) {
      console.error("❌ Closer falhou:", err);
      await alertar({
        chave: `closer-erro-${convId}`,
        nivel: "atencao",
        area: "vendas",
        titulo: `Falha ao responder cliente ${c.nome || c.telefone || c.email}`,
        detalhe: String(err?.message || err).slice(0, 500),
      });
    }
  });
  const limpo = atual.catch(() => undefined);
  travas.set(convId, limpo);
  void limpo.then(() => travas.get(convId) === limpo && travas.delete(convId));
  return atual;
}

// ---------------------------------------------------------------- relógio

let rodando = false;

export async function cicloRecuperacao() {
  if (rodando || !recuperacaoConfig.ativa || config.pausado) return;
  rodando = true;
  try {
    const agora = new Date();

    // Desiste de quem nunca respondeu depois de N dias.
    await ConversationModel.updateMany(
      { status: { $in: ["aguardando", "contatado"] }, createdAt: { $lt: new Date(Date.now() - recuperacaoConfig.diasParaDesistir * 86400_000) } },
      { status: "perdido", $unset: { proximoContatoEm: 1 } }
    );

    const vencidas = await ConversationModel.find({
      status: { $in: ["aguardando", "contatado", "em_conversa"] },
      proximoContatoEm: { $lte: agora },
    }).limit(50);

    for (const c of vencidas) {
      const venda = await pagou(c);
      if (venda) {
        await registrarPagamento({ email: c.email || undefined, telefone: c.telefone || undefined, valor: venda.valor ?? undefined });
        continue;
      }

      // Follow-up de quem parou de responder no meio da conversa.
      if (c.status === "em_conversa") {
        c.followups += 1;
        c.proximoContatoEm = undefined;
        await c.save();
        if (janelaAberta(c) && dentroDoHorario()) {
          void rodarCloser(
            c.id,
            "O cliente parou de responder há algumas horas. Se fizer sentido, mande UM follow-up curto e leve (sem pressão), retomando o ponto onde pararam. Se a conversa já terminou de forma natural, não envie nada."
          );
        }
        continue;
      }

      if (!dentroDoHorario()) {
        c.proximoContatoEm = proximoHorarioPermitido();
        await c.save();
        continue;
      }

      await contatoAtivo(c);
    }
  } catch (err) {
    console.error("❌ Erro no ciclo de recuperação:", err);
  } finally {
    rodando = false;
  }
}

async function contatoAtivo(c: any) {
  const tentativa = c.tentativas; // 0 = primeiro contato
  const proximoAtraso = recuperacaoConfig.atrasosMin[tentativa + 1];
  c.tentativas += 1;
  c.status = "contatado";
  c.proximoContatoEm = proximoAtraso ? new Date(c.createdAt.getTime() + proximoAtraso * 60_000) : undefined;

  if (c.canal === "whatsapp" && c.telefone) {
    const template = recuperacaoConfig.templates[tentativa] || recuperacaoConfig.templates[recuperacaoConfig.templates.length - 1];
    if (!template) {
      c.proximoContatoEm = undefined;
      await c.save();
      return;
    }
    try {
      await wa.enviarTemplate(c.telefone, template, [primeiroNome(c.nome), c.produto || "seu pedido"], recuperacaoConfig.idiomaTemplate);
      c.mensagens.push({ de: "agente", texto: `[template ${template}] Contato de recuperação nº ${tentativa + 1}.` });
    } catch (err: any) {
      c.mensagens.push({ de: "sistema", texto: `Falha ao enviar template: ${err?.message || err}` });
      await alertar({
        chave: `wa-template-erro-${new Date().toISOString().slice(0, 10)}`,
        nivel: "critico",
        area: "vendas",
        titulo: "Recuperação de PIX: falha ao enviar WhatsApp",
        detalhe: String(err?.message || err).slice(0, 500),
      });
    }
    await c.save();
    return;
  }

  // Sem WhatsApp: um único e-mail escrito pela closer.
  c.proximoContatoEm = undefined;
  await c.save();
  if (c.email && tentativa === 0) {
    void rodarCloser(
      c.id,
      "Primeiro contato por e-mail: o cliente gerou o PIX e não pagou. Escreva UM e-mail curto e humano (enviar_mensagem), perguntando se ficou alguma dúvida, reenviando o PIX se houver código, ou o link da oferta certa. Assine com o nome do atendente."
    );
  }
}
