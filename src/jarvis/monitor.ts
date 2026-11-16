// Vigilância contínua. As checagens são regras simples (sem custo de IA);
// a IA só é acordada quando aparece algo que precisa de investigação.

import { config } from "./config";
import { alertar } from "./alerts";
import { SaleModel, TicketModel } from "./models";
import { resumoAnuncios } from "./tools/operation";
import { perguntarAoJarvis } from "./agents/chief";
import { rodarEspecialista } from "./agents/specialists";

function hoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.relatorio.timezone }).format(new Date());
}

type Achado = { chave: string; nivel: "info" | "atencao" | "critico"; area: string; titulo: string; detalhe: string };

async function checarAnuncios(): Promise<Achado[]> {
  const r: any = await resumoAnuncios("today");
  if (!r.configurado) return [];
  if (r.erro) {
    return [{ chave: `meta-api-erro-${hoje()}`, nivel: "critico", area: "trafego", titulo: "Erro ao ler a conta de anúncios", detalhe: r.erro }];
  }
  const achados: Achado[] = [];
  for (const c of r.campanhas) {
    if (c.gasto >= config.monitor.gastoMinimoParaJulgar && (c.roas ?? 0) < config.monitor.roasMinimo) {
      achados.push({
        chave: `roas-baixo-${c.id}-${hoje()}`,
        nivel: c.compras === 0 ? "critico" : "atencao",
        area: "trafego",
        titulo: `Campanha "${c.nome}" com ROAS ${(c.roas ?? 0).toFixed(2)} hoje`,
        detalhe: `Gasto R$${c.gasto.toFixed(2)}, ${c.compras} compras, receita R$${c.receita.toFixed(2)}.`,
      });
    }
  }
  return achados;
}

async function checarVendas(): Promise<Achado[]> {
  const achados: Achado[] = [];
  const semana = await SaleModel.countDocuments({ aprovada: true, createdAt: { $gte: new Date(Date.now() - 7 * 86400_000) } });
  if (semana > 0) {
    const limite = new Date(Date.now() - config.monitor.horasSemVendaAlerta * 3600_000);
    const recente = await SaleModel.exists({ aprovada: true, createdAt: { $gte: limite } });
    if (!recente) {
      achados.push({
        chave: `sem-vendas-${hoje()}`,
        nivel: "critico",
        area: "vendas",
        titulo: `Nenhuma venda aprovada há ${config.monitor.horasSemVendaAlerta}h`,
        detalhe: "Pode ser checkout, pixel, página fora do ar, anúncio reprovado ou só o horário. Verificar.",
      });
    }
  }
  const ultimos = await SaleModel.find().sort({ createdAt: -1 }).limit(20).lean();
  const recusados = ultimos.filter((v) => !v.aprovada).length;
  if (ultimos.length >= 10 && recusados / ultimos.length > 0.6) {
    achados.push({
      chave: `muitas-recusas-${hoje()}`,
      nivel: "atencao",
      area: "vendas",
      titulo: `${recusados} de ${ultimos.length} últimas transações não aprovadas`,
      detalhe: "Possível problema no checkout/antifraude ou muitos boletos/PIX não pagos.",
    });
  }
  return achados;
}

async function checarSuporte(): Promise<Achado[]> {
  const limite = new Date(Date.now() - config.monitor.horasTicketPendenteAlerta * 3600_000);
  const atrasados = await TicketModel.countDocuments({ status: "aberto", createdAt: { $lte: limite } });
  if (!atrasados) return [];
  return [{
    chave: `tickets-atrasados-${hoje()}`,
    nivel: "atencao",
    area: "suporte",
    titulo: `${atrasados} cliente(s) sem resposta há mais de ${config.monitor.horasTicketPendenteAlerta}h`,
    detalhe: "Verifique o envio de e-mail ou as aprovações pendentes.",
  }];
}

let rodando = false;

export async function cicloDeMonitoramento() {
  if (rodando) return;
  rodando = true;
  try {
    const checagens = await Promise.allSettled([checarAnuncios(), checarVendas(), checarSuporte()]);
    const achados: Achado[] = [];
    for (const c of checagens) {
      if (c.status === "fulfilled") achados.push(...c.value);
      else achados.push({ chave: `monitor-falhou-${hoje()}`, nivel: "atencao", area: "sistema", titulo: "Uma checagem do monitor falhou", detalhe: String(c.reason) });
    }

    const novosCriticos: Achado[] = [];
    for (const a of achados) {
      if ((await alertar(a)) && a.nivel === "critico") novosCriticos.push(a);
    }

    // Clientes novos esperando: o suporte atende sozinho.
    const ticketsNovos = await TicketModel.countDocuments({ status: "aberto" });
    if (ticketsNovos > 0 && process.env.JARVIS_AUTO_SUPORTE !== "false") {
      await rodarEspecialista("suporte_clientes", `Há ${ticketsNovos} ticket(s) aberto(s). Atenda todos.`);
    }

    // Problema crítico novo: o JARVIS investiga e age.
    if (novosCriticos.length && config.monitor.autoAcao) {
      const lista = novosCriticos.map((a) => `- [${a.area}] ${a.titulo}: ${a.detalhe}`).join("\n");
      await perguntarAoJarvis(
        `Alertas críticos acabaram de disparar:\n${lista}\n\nInvestigue a causa com os dados, acione os especialistas necessários, resolva o que estiver na sua autonomia e me mande um resumo curto pelo notificar_dono dizendo o que encontrou e o que fez.`
      );
    }
  } catch (err) {
    console.error("❌ Erro no ciclo de monitoramento:", err);
  } finally {
    rodando = false;
  }
}
