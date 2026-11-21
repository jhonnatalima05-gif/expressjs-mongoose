// Dados reais para a interface da central (vendas do dia, ROAS, agentes, calendário, eventos).

import { config } from "./config";
import { AlertModel, ConversationModel, DecisionModel, ReportModel, SaleModel, TicketModel } from "./models";
import { resumoAnuncios } from "./tools/operation";
import { oportunidades } from "./seasonality";

const tz = () => config.relatorio.timezone;
const dataLocal = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz() }).format(d);
const horaLocal = (d: Date) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: tz(), hour: "numeric", hour12: false }).format(d)) % 24;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Meta Ads é chamada no máximo a cada 5 min, mesmo com a central aberta em vários aparelhos.
let cacheAnuncios: { em: number; dados: any } | null = null;
async function anunciosHoje() {
  if (cacheAnuncios && Date.now() - cacheAnuncios.em < 5 * 60_000) return cacheAnuncios.dados;
  const dados = await resumoAnuncios("today");
  cacheAnuncios = { em: Date.now(), dados };
  return dados;
}

export async function montarPainel() {
  const agora = new Date();
  const hoje = dataLocal(agora);
  const ontem = dataLocal(new Date(agora.getTime() - 86400_000));

  const [vendas, anuncios, emConversa, ticketsAbertos, alertasAbertos, ultimaMineracao, recentes, recuperadas, decisoes] =
    await Promise.all([
      SaleModel.find({ aprovada: true, createdAt: { $gte: new Date(agora.getTime() - 50 * 3600_000) } }, { valor: 1, createdAt: 1 }).lean(),
      anunciosHoje(),
      ConversationModel.countDocuments({ status: "em_conversa" }),
      TicketModel.countDocuments({ status: { $in: ["aberto", "aguardando_aprovacao"] } }),
      AlertModel.countDocuments({ resolvido: false }),
      ReportModel.findOne({ tipo: "mineracao" }).sort({ createdAt: -1 }).lean(),
      SaleModel.find({ aprovada: true }).sort({ createdAt: -1 }).limit(5).lean(),
      ConversationModel.find({ status: "convertido", valorRecuperado: { $gt: 0 } }).sort({ updatedAt: -1 }).limit(3).lean(),
      DecisionModel.find().sort({ createdAt: -1 }).limit(3).lean(),
    ]);

  // Vendas de hoje, acumuladas hora a hora, e comparação com ontem até a mesma hora.
  const horaAgora = horaLocal(agora);
  const porHora = new Array(24).fill(0);
  let totalHoje = 0, qtdHoje = 0, ontemAteAgora = 0;
  for (const v of vendas as any[]) {
    const d = new Date(v.createdAt);
    const valor = v.valor || 0;
    if (dataLocal(d) === hoje) {
      porHora[horaLocal(d)] += valor;
      totalHoje += valor;
      qtdHoje++;
    } else if (dataLocal(d) === ontem && horaLocal(d) <= horaAgora) {
      ontemAteAgora += valor;
    }
  }
  const acumulado: number[] = [];
  porHora.slice(0, horaAgora + 1).reduce((s, v) => (acumulado.push(s + v), s + v), 0);

  // ROAS: geral do dia e as 3 campanhas com mais gasto.
  const roas = !anuncios.configurado
    ? { configurado: false }
    : anuncios.erro
      ? { configurado: true, erro: true }
      : {
          configurado: true,
          geral: anuncios.roasGeral,
          gasto: anuncios.gastoTotal,
          minimo: config.monitor.roasMinimo,
          campanhas: (anuncios.campanhas || []).slice(0, 3).map((c: any) => ({ nome: c.nome, roas: c.roas, gasto: c.gasto })),
        };

  const temCanalContato = Boolean(process.env.WHATSAPP_TOKEN || process.env.RESEND_API_KEY);
  const agentes = [
    {
      nome: "Minerador de ofertas",
      status: ultimaMineracao
        ? `última ${new Date((ultimaMineracao as any).createdAt).toLocaleDateString("pt-BR", { timeZone: tz(), day: "2-digit", month: "2-digit" })}`
        : process.env.APIFY_TOKEN ? "pronto" : "pronto (web)",
      tom: "ok",
    },
    {
      nome: "Gestor de tráfego",
      status: anuncios.configurado ? (anuncios.erro ? "erro na Meta" : "ativo") : "sem Meta Ads",
      tom: anuncios.configurado ? (anuncios.erro ? "alerta" : "ok") : "off",
    },
    {
      nome: "Recuperação de PIX",
      status: temCanalContato ? `${emConversa} conversa${emConversa === 1 ? "" : "s"}` : "sem canal",
      tom: temCanalContato ? "ok" : "off",
    },
    { nome: "Suporte", status: ticketsAbertos ? `${ticketsAbertos} aberto${ticketsAbertos === 1 ? "" : "s"}` : "em dia", tom: ticketsAbertos ? "alerta" : "ok" },
    { nome: "Copywriter", status: "pronto", tom: "ok" },
  ];

  // Faixa de eventos recentes.
  const eventos: { tipo: string; texto: string; em: number }[] = [];
  for (const v of recentes as any[]) eventos.push({ tipo: "venda", texto: `Venda aprovada ${brl(v.valor || 0)}${v.produto ? ` · ${v.produto}` : ""}`, em: +new Date(v.createdAt) });
  for (const c of recuperadas as any[]) eventos.push({ tipo: "pix", texto: `PIX recuperado ${brl(c.valorRecuperado || 0)}`, em: +new Date(c.updatedAt) });
  for (const d of decisoes as any[]) eventos.push({ tipo: "decisao", texto: String(d.motivo || d.decisao || "").slice(0, 80), em: +new Date(d.createdAt) });
  eventos.sort((a, b) => b.em - a.em);

  return {
    atualizadoEm: agora.toISOString(),
    autonomia: config.autonomia,
    pausado: config.pausado,
    alertasAbertos,
    vendasHoje: {
      total: totalHoje,
      quantidade: qtdHoje,
      variacao: ontemAteAgora > 0 ? (totalHoje - ontemAteAgora) / ontemAteAgora : null,
      acumuladoPorHora: acumulado,
    },
    roas,
    agentes,
    oportunidades: oportunidades(agora, 120).slice(0, 3).map((o) => ({ nome: o.nome, situacao: o.situacao, comecaEm: o.comecaEm, terminaEm: o.terminaEm })),
    eventos: eventos.slice(0, 8),
  };
}
