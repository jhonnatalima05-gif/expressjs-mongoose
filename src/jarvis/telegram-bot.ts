// Controle remoto do JARVIS pelo Telegram (celular, tablet, PC, navegador).
// Usa "long polling": funciona tanto no servidor na nuvem quanto rodando no seu PC,
// sem precisar de domínio nem configurar webhook.

import { config } from "./config";
import { enviarMensagem, telegram, telegramConfigurado } from "./integrations/telegram";
import { perguntarAoJarvis } from "./agents/chief";
import { decidirAprovacao } from "./tools/actions";
import { panorama } from "./tools/operation";
import { AlertModel, ApprovalModel, OwnerMemoryModel } from "./models";
import { definirAutonomia, definirPausa } from "./settings";
import { gerarRelatorioDiario } from "./scheduler";

const AJUDA = `À disposição, Senhor. Pode falar comigo normalmente — ordens, perguntas, "o que acontece se...".

Atalhos:
/panorama — como está a operação agora
/relatorio — gerar o relatório completo agora
/alertas — problemas em aberto
/aprovacoes — o que espera o seu sim
/autonomia total | supervisionada — quanto eu decido sozinho
/pausar — congelo todas as ações automáticas
/retomar — volto a agir sozinho`;

const brl = (n: number) => `R$${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function textoPanorama() {
  const p: any = await panorama();
  const a = p.anuncios;
  const anuncios = !a.configurado
    ? "Anúncios: Meta não configurada."
    : a.erro
      ? `Anúncios: erro — ${a.erro}`
      : `Anúncios hoje: gasto ${brl(a.gastoTotal)}, receita ${brl(a.receitaAtribuida)}, ROAS ${a.roasGeral?.toFixed(2) ?? "—"}`;
  return [
    `📊 Panorama — ${p.agora}`,
    `Autonomia: ${p.autonomia}${config.pausado ? " (PAUSADO)" : ""}`,
    `Vendas 24h: ${p.vendas24h.aprovadas} (${brl(p.vendas24h.receita)}) | 7d: ${p.vendas7d.aprovadas} (${brl(p.vendas7d.receita)})`,
    anuncios,
    `Recuperação PIX 24h: ${p.recuperacao24h.pixGerados} gerados, ${p.recuperacao24h.contatados} contatados, ${p.recuperacao24h.recuperados} recuperados (${brl(p.recuperacao24h.valorRecuperado)}), ${p.recuperacao24h.emConversa} em conversa`,
    `Suporte: ${p.suporte.abertos} ticket(s) aberto(s)`,
    `Alertas abertos: ${p.alertasAbertos.length} | Aprovações pendentes: ${p.aprovacoesPendentes.length}`,
  ].join("\n");
}

// Depois de aprovar/rejeitar, o próximo "porque ..." vira aprendizado.
let ultimaDecisao: { descricao: string; aprovou: boolean } | null = null;

async function tratarBotao(cb: any) {
  const [acao, id] = String(cb.data || "").split(":");
  await telegram("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => undefined);
  const aprovar = acao === "ap";
  const ap = await ApprovalModel.findById(id).lean();
  const resultado = await decidirAprovacao(id, aprovar);
  ultimaDecisao = ap ? { descricao: String(ap.descricao), aprovou: aprovar } : null;
  await enviarMensagem(
    config.telegram.chatId,
    `${aprovar ? "✅ Aprovado" : "❌ Rejeitado"}. ${resultado}\n\nSe quiser que eu aprenda, me diga o motivo começando com "porque".`
  );
}

async function tratarTexto(texto: string) {
  const chat = config.telegram.chatId;
  const [comando, ...args] = texto.trim().split(/\s+/);

  switch (comando.toLowerCase().replace(/@.*/, "")) {
    case "/start":
    case "/ajuda":
      return enviarMensagem(chat, AJUDA);
    case "/panorama":
      return enviarMensagem(chat, await textoPanorama());
    case "/relatorio":
      await enviarMensagem(chat, "Preparando o relatório, Senhor. Leva alguns minutos.");
      await gerarRelatorioDiario(); // já envia pelo Telegram
      return;
    case "/alertas": {
      const alertas = await AlertModel.find({ resolvido: false }).sort({ createdAt: -1 }).limit(20).lean();
      return enviarMensagem(
        chat,
        alertas.length ? alertas.map((a: any) => `• [${a.nivel}] ${a.titulo}`).join("\n") : "Nenhum alerta em aberto, Senhor."
      );
    }
    case "/aprovacoes": {
      const pendentes = await ApprovalModel.find({ status: "pendente" }).sort({ createdAt: 1 }).limit(10).lean();
      if (!pendentes.length) return enviarMensagem(chat, "Nada esperando o seu sim, Senhor.");
      for (const ap of pendentes) {
        await enviarMensagem(chat, `🟡 ${ap.descricao}`, [
          [
            { texto: "✅ Aprovar", dados: `ap:${ap._id}` },
            { texto: "❌ Rejeitar", dados: `rj:${ap._id}` },
          ],
        ]);
      }
      return;
    }
    case "/autonomia": {
      const modo = args[0]?.toLowerCase();
      if (modo !== "total" && modo !== "supervisionada") {
        return enviarMensagem(chat, `Autonomia atual: ${config.autonomia}. Use /autonomia total ou /autonomia supervisionada.`);
      }
      await definirAutonomia(modo);
      return enviarMensagem(
        chat,
        modo === "total"
          ? `Entendido. A partir de agora eu decido e executo sozinho, dentro dos limites: orçamento até ${brl(config.limites.maxOrcamentoDiario)}/dia e ajustes de até ${config.limites.maxVariacaoOrcamentoPct}% por vez. Acima disso, e para ativar campanhas ou reembolsos, eu ainda consulto o Senhor.`
          : "Entendido. Eu analiso e preparo tudo, mas só executo com o seu sim."
      );
    }
    case "/pausar":
      await definirPausa(true);
      return enviarMensagem(chat, "Ações automáticas congeladas. Continuo vigiando e avisando, mas não mexo em nada até /retomar.");
    case "/retomar":
      await definirPausa(false);
      return enviarMensagem(chat, "De volta ao trabalho, Senhor.");
  }

  if (ultimaDecisao && /^porque\b/i.test(texto.trim())) {
    await OwnerMemoryModel.create({
      aprendizado: `${ultimaDecisao.aprovou ? "Aprovou" : "Rejeitou"} "${ultimaDecisao.descricao}". Motivo: ${texto.trim()}`,
      origem: "telegram",
    });
    ultimaDecisao = null;
    return enviarMensagem(chat, "Anotado. Vou levar isso em conta nas próximas decisões.");
  }

  // Conversa livre: vai direto para o JARVIS.
  await telegram("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => undefined);
  const resposta = await perguntarAoJarvis(
    `Mensagem do dono (via Telegram): ${texto}\n\nResponda de forma curta, como numa conversa de celular.`
  );
  return enviarMensagem(chat, resposta);
}

async function tratarUpdate(u: any) {
  const msg = u.message;
  const cb = u.callback_query;
  const chatId = String(msg?.chat?.id ?? cb?.message?.chat?.id ?? "");
  // Segurança: só obedece ao dono.
  if (chatId !== String(config.telegram.chatId)) {
    console.warn(`⚠️ Telegram: mensagem ignorada de chat não autorizado ${chatId}`);
    return;
  }
  try {
    if (cb) await tratarBotao(cb);
    else if (msg?.text) await tratarTexto(msg.text);
  } catch (err: any) {
    console.error("❌ Erro no bot do Telegram:", err);
    await enviarMensagem(config.telegram.chatId, `Tive um problema, Senhor: ${err?.message || err}`).catch(() => undefined);
  }
}

export async function iniciarBotTelegram() {
  if (!telegramConfigurado()) {
    console.warn("⚠️ Telegram não configurado: controle pelo celular desligado.");
    return;
  }
  await telegram("deleteWebhook", {}).catch(() => undefined);
  await telegram("setMyCommands", {
    commands: [
      { command: "panorama", description: "Como está a operação agora" },
      { command: "relatorio", description: "Relatório completo agora" },
      { command: "alertas", description: "Problemas em aberto" },
      { command: "aprovacoes", description: "O que espera o seu sim" },
      { command: "autonomia", description: "total ou supervisionada" },
      { command: "pausar", description: "Congelar ações automáticas" },
      { command: "retomar", description: "Voltar a agir sozinho" },
    ],
  }).catch(() => undefined);
  console.log("📱 Controle pelo Telegram ativo.");

  let offset = 0;
  // Laço eterno de leitura; cada mensagem é tratada sem travar a leitura das próximas.
  (async () => {
    for (;;) {
      try {
        const updates: any[] = await telegram("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] });
        for (const u of updates) {
          offset = u.update_id + 1;
          void tratarUpdate(u);
        }
      } catch (err) {
        console.error("❌ Telegram getUpdates:", err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
