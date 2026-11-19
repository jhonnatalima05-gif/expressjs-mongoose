import { config } from "./config";
import { cicloDeMonitoramento } from "./monitor";
import { perguntarAoJarvis } from "./agents/chief";
import { ReportModel } from "./models";
import { notificarDono } from "./integrations/telegram";
import { carregarConfiguracoes } from "./settings";
import { cicloRecuperacao } from "./recovery";
import { rodarEspecialista } from "./agents/specialists";

const PROMPT_RELATORIO = `Gere o relatório diário da operação para o dono.
Use panorama_operacao e resumo_vendas, e peça ao gestor_trafego a análise de ontem vs últimos 7 dias e ao estrategista a projeção "se continuar assim" para 7 e 30 dias.
Formato (texto puro, cabe no celular):
1. Resumo em 3 linhas (como está o dia/semana).
2. Números: vendas, receita, gasto, ROAS, lucro estimado — com comparação.
3. O que eu (JARVIS) e a equipe fizemos nas últimas 24h e por quê.
4. Recuperação de PIX: gerados, contatados, conversas, convertidos e valor recuperado (24h); o que mais trava os clientes.
5. Problemas e alertas (abertos e resolvidos).
6. Aprovações que esperam o Senhor.
7. Visão do alto: para onde a operação vai se nada mudar, e minhas 3 recomendações em ordem de prioridade.`;

export async function gerarRelatorioDiario(): Promise<string> {
  const texto = await perguntarAoJarvis(PROMPT_RELATORIO);
  await ReportModel.create({ tipo: "diario", conteudo: texto });
  await notificarDono(`📋 Relatório diário\n\n${texto}`);
  return texto;
}

export const PROMPT_MINERACAO = `Mineração da semana. Comece pelo calendario_oportunidades e foque nas janelas ATIVAS e em PREPARAR AGORA, sem esquecer as ofertas perenes. Use a Biblioteca de Anúncios com vários termos por nicho, separe o que está realmente escalando, cruze com a época do ano e entregue as 3 melhores oportunidades modeladas como oferta própria, com cronograma.`;

export async function rodarMineracao(foco?: string): Promise<string> {
  const resultado = await rodarEspecialista("minerador_ofertas", foco ? `${PROMPT_MINERACAO}\n\nFoco pedido pelo dono: ${foco}` : PROMPT_MINERACAO);
  await ReportModel.create({ tipo: "mineracao", conteudo: resultado });
  await notificarDono(`⛏️ Mineração de ofertas\n\n${resultado}`);
  return resultado;
}

function agoraLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.relatorio.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => partes.find((p) => p.type === t)?.value || "";
  const diaSemana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { data: `${get("year")}-${get("month")}-${get("day")}`, hora: Number(get("hour")) % 24, diaSemana };
}

// Mineração automática semanal (padrão: segunda às 7h). JARVIS_MINERACAO_DIA=-1 desliga.
let ultimaMineracao = "";
async function talvezMineracao() {
  const dia = Number(process.env.JARVIS_MINERACAO_DIA ?? 1);
  const hora = Number(process.env.JARVIS_MINERACAO_HORA ?? 7);
  const { data, hora: h, diaSemana } = agoraLocal();
  if (dia < 0 || diaSemana !== dia || h !== hora || ultimaMineracao === data || config.pausado) return;
  ultimaMineracao = data;
  const jaFeita = await ReportModel.exists({ tipo: "mineracao", createdAt: { $gte: new Date(Date.now() - 5 * 86400_000) } });
  if (jaFeita) return;
  try {
    await rodarMineracao();
  } catch (err) {
    console.error("❌ Falha na mineração semanal:", err);
    await notificarDono("🔴 Senhor, a mineração semanal de ofertas falhou. Detalhes no log.");
  }
}

let ultimoRelatorio = "";

async function talvezRelatorio() {
  const { data, hora } = agoraLocal();
  if (hora !== config.relatorio.hora || ultimoRelatorio === data) return;
  ultimoRelatorio = data;
  // Evita duplicar após reinício do servidor.
  const jaFeito = await ReportModel.exists({ tipo: "diario", createdAt: { $gte: new Date(Date.now() - 20 * 3600_000) } });
  if (jaFeito) return;
  try {
    await gerarRelatorioDiario();
  } catch (err) {
    console.error("❌ Falha no relatório diário:", err);
    await notificarDono("🔴 Senhor, não consegui gerar o relatório diário. Detalhes no log do servidor.");
  }
}

export async function iniciarAgendador() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️ ANTHROPIC_API_KEY ausente: JARVIS desligado.");
    return;
  }
  await carregarConfiguracoes().catch((err) => console.error("❌ Falha ao carregar configurações:", err));
  const min = config.monitor.intervaloMin;
  setInterval(cicloDeMonitoramento, min * 60_000);
  setInterval(talvezRelatorio, 60_000);
  setInterval(cicloRecuperacao, 60_000);
  setInterval(talvezMineracao, 60_000);
  setTimeout(cicloDeMonitoramento, 30_000);
  console.log(`🧠 JARVIS online — monitorando a cada ${min} min, relatório diário às ${config.relatorio.hora}h (${config.relatorio.timezone}), autonomia: ${config.autonomia}.`);
}
