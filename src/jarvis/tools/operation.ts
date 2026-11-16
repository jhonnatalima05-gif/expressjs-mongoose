// Leitura do estado da operação: vendas, anúncios, suporte, alertas, decisões.

import { config } from "../config";
import {
  AlertModel,
  ApprovalModel,
  DecisionModel,
  OfferModel,
  SaleModel,
  TicketModel,
} from "../models";
import * as meta from "../integrations/meta-ads";

export async function resumoVendas(horas: number) {
  const desde = new Date(Date.now() - horas * 3600_000);
  const vendas = await SaleModel.find({ createdAt: { $gte: desde } }).lean();
  const aprovadas = vendas.filter((v) => v.aprovada);
  const porProduto: Record<string, { qtd: number; receita: number }> = {};
  for (const v of aprovadas) {
    const p = v.produto || "desconhecido";
    porProduto[p] ??= { qtd: 0, receita: 0 };
    porProduto[p].qtd++;
    porProduto[p].receita += v.valor || 0;
  }
  const ultima = await SaleModel.findOne({ aprovada: true }).sort({ createdAt: -1 }).lean();
  return {
    periodoHoras: horas,
    eventos: vendas.length,
    aprovadas: aprovadas.length,
    receita: aprovadas.reduce((s, v) => s + (v.valor || 0), 0),
    naoAprovadas: vendas.length - aprovadas.length,
    porProduto,
    ultimaVendaAprovadaEm: ultima ? (ultima as any).createdAt : null,
  };
}

export async function resumoAnuncios(periodo = "today") {
  if (!config.meta.accessToken || !config.meta.adAccountId) {
    return { configurado: false, aviso: "Meta Ads não configurado." };
  }
  try {
    const campanhas = await meta.insightsCampanhas(periodo);
    const gasto = campanhas.reduce((s, c) => s + c.gasto, 0);
    const receita = campanhas.reduce((s, c) => s + c.receita, 0);
    return {
      configurado: true,
      periodo,
      gastoTotal: gasto,
      receitaAtribuida: receita,
      roasGeral: gasto > 0 ? receita / gasto : null,
      campanhas: campanhas.sort((a, b) => b.gasto - a.gasto),
    };
  } catch (err: any) {
    return { configurado: true, erro: String(err?.message || err) };
  }
}

export async function resumoSuporte() {
  const abertos = await TicketModel.find({ status: { $in: ["aberto", "aguardando_aprovacao"] } })
    .sort({ createdAt: 1 })
    .limit(50)
    .lean();
  return {
    abertos: abertos.length,
    tickets: abertos.map((t: any) => ({
      id: String(t._id),
      status: t.status,
      cliente: t.clienteEmail,
      assunto: t.assunto,
      mensagem: (t.mensagem || "").slice(0, 1500),
      abertoEm: t.createdAt,
    })),
  };
}

export async function panorama() {
  const [vendas24h, vendas7d, anuncios, suporte, alertas, aprovacoes, decisoes, ofertas] = await Promise.all([
    resumoVendas(24),
    resumoVendas(24 * 7),
    resumoAnuncios("today"),
    resumoSuporte(),
    AlertModel.find({ resolvido: false }).sort({ createdAt: -1 }).limit(30).lean(),
    ApprovalModel.find({ status: "pendente" }).sort({ createdAt: -1 }).limit(20).lean(),
    DecisionModel.find().sort({ createdAt: -1 }).limit(20).lean(),
    OfferModel.find().sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return {
    agora: new Date().toLocaleString("pt-BR", { timeZone: config.relatorio.timezone }),
    autonomia: config.autonomia,
    pausado: config.pausado,
    vendas24h,
    vendas7d,
    anuncios,
    suporte: { abertos: suporte.abertos },
    alertasAbertos: alertas.map((a: any) => ({ id: String(a._id), nivel: a.nivel, area: a.area, titulo: a.titulo, detalhe: a.detalhe })),
    aprovacoesPendentes: aprovacoes.map((a: any) => ({ id: String(a._id), tipo: a.tipo, descricao: a.descricao })),
    ultimasDecisoes: decisoes.map((d: any) => ({ agente: d.agente, decisao: d.decisao, motivo: d.motivo, executada: d.executada, em: d.createdAt })),
    ultimasOfertasMineradas: ofertas.map((o: any) => ({ nome: o.nome, nicho: o.nicho, nota: o.nota })),
  };
}
