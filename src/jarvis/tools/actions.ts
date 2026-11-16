// Ações com efeito no mundo real (dinheiro e clientes). Todas passam por aqui
// para que os limites de autonomia sejam aplicados num lugar só.

import { config } from "../config";
import { ApprovalModel, DecisionModel, TicketModel } from "../models";
import * as meta from "../integrations/meta-ads";
import { enviarEmail } from "../integrations/email";
import { notificarDono } from "../integrations/telegram";

export type Acao =
  | { tipo: "pausar_campanha"; id: string; motivo: string }
  | { tipo: "ativar_campanha"; id: string; motivo: string }
  | { tipo: "ajustar_orcamento"; id: string; novoOrcamento: number; motivo: string }
  | { tipo: "responder_ticket"; ticketId: string; resposta: string; motivo: string }
  | { tipo: "reembolso"; ticketId: string; valor: number; motivo: string };

// Decide se a ação pode rodar sem o dono. Retorna o motivo quando não pode.
async function precisaAprovacao(acao: Acao): Promise<string | null> {
  if (acao.tipo === "reembolso") {
    return acao.valor > config.limites.maxReembolsoAutomatico ? "reembolso acima do limite automático" : null;
  }
  if (config.pausado) return "JARVIS pausado pelo dono";
  if (config.autonomia === "supervisionada") return "modo supervisionado";
  if (acao.tipo === "ajustar_orcamento") {
    if (acao.novoOrcamento > config.limites.maxOrcamentoDiario) {
      return `orçamento acima do teto de R$${config.limites.maxOrcamentoDiario}/dia`;
    }
    const atual = await meta.lerCampanha(acao.id);
    const atualReais = Number(atual.daily_budget || 0) / 100;
    if (atualReais > 0) {
      const variacao = (Math.abs(acao.novoOrcamento - atualReais) / atualReais) * 100;
      if (variacao > config.limites.maxVariacaoOrcamentoPct) {
        return `variação de ${variacao.toFixed(0)}% acima do limite de ${config.limites.maxVariacaoOrcamentoPct}%`;
      }
    }
  }
  if (acao.tipo === "ativar_campanha") return "ativar campanha gasta dinheiro novo";
  return null;
}

export async function executar(acao: Acao): Promise<string> {
  switch (acao.tipo) {
    case "pausar_campanha":
      await meta.alterarStatus(acao.id, "PAUSED");
      return `Campanha ${acao.id} pausada.`;
    case "ativar_campanha":
      await meta.alterarStatus(acao.id, "ACTIVE");
      return `Campanha ${acao.id} ativada.`;
    case "ajustar_orcamento":
      await meta.alterarOrcamentoDiario(acao.id, acao.novoOrcamento);
      return `Orçamento diário de ${acao.id} ajustado para R$${acao.novoOrcamento.toFixed(2)}.`;
    case "responder_ticket": {
      const ticket = await TicketModel.findById(acao.ticketId);
      if (!ticket || !ticket.clienteEmail) throw new Error("Ticket sem e-mail de cliente.");
      await enviarEmail(ticket.clienteEmail, `Re: ${ticket.assunto || "sua mensagem"}`, acao.resposta);
      ticket.status = "respondido";
      ticket.resposta = acao.resposta;
      await ticket.save();
      return `Resposta enviada para ${ticket.clienteEmail}.`;
    }
    case "reembolso":
      // Reembolso depende da plataforma (Cakto/Ticto/Kiwify). Até integrar a API,
      // o JARVIS só prepara e avisa o dono para executar no painel.
      await notificarDono(`💸 Reembolso aprovado de R$${acao.valor.toFixed(2)} (ticket ${acao.ticketId}). Execute no painel da plataforma.`);
      return "Reembolso registrado; execução manual no painel da plataforma.";
  }
}

// Ponto de entrada usado pelos agentes.
export async function solicitarAcao(acao: Acao, agente: string): Promise<string> {
  const bloqueio = await precisaAprovacao(acao);
  await DecisionModel.create({
    agente,
    decisao: JSON.stringify(acao),
    motivo: acao.motivo,
    executada: !bloqueio,
  });

  if (bloqueio) {
    const descricao = `${acao.tipo}: ${acao.motivo}`;
    const aprovacao = await ApprovalModel.create({ tipo: acao.tipo, descricao, payload: acao });
    if (acao.tipo === "responder_ticket") {
      await TicketModel.findByIdAndUpdate(acao.ticketId, { status: "aguardando_aprovacao", resposta: acao.resposta });
    }
    await notificarDono(`🟡 Senhor, preciso da sua autorização (${bloqueio}).\n\n${descricao}`, [
      [
        { texto: "✅ Aprovar", dados: `ap:${aprovacao.id}` },
        { texto: "❌ Rejeitar", dados: `rj:${aprovacao.id}` },
      ],
    ]);
    return `Ação NÃO executada: aguardando aprovação do dono (${bloqueio}). ID da aprovação: ${aprovacao.id}`;
  }

  try {
    return await executar(acao);
  } catch (err: any) {
    return `Falha ao executar ${acao.tipo}: ${err?.message || err}`;
  }
}

export async function decidirAprovacao(id: string, aprovar: boolean): Promise<string> {
  const aprovacao = await ApprovalModel.findById(id);
  if (!aprovacao) throw new Error("Aprovação não encontrada.");
  if (aprovacao.status !== "pendente") return `Aprovação já está ${aprovacao.status}.`;
  if (!aprovar) {
    aprovacao.status = "rejeitada";
    await aprovacao.save();
    return "Rejeitada.";
  }
  try {
    aprovacao.resultado = await executar(aprovacao.payload as Acao);
    aprovacao.status = "executada";
  } catch (err: any) {
    aprovacao.resultado = String(err?.message || err);
    aprovacao.status = "falhou";
  }
  await aprovacao.save();
  return aprovacao.resultado || "";
}
