import { config } from "./config";
import { cicloDeMonitoramento } from "./monitor";
import { perguntarAoJarvis } from "./agents/chief";
import { ReportModel } from "./models";
import { notificarDono } from "./integrations/telegram";

const PROMPT_RELATORIO = `Gere o relatório diário da operação para o dono.
Use panorama_operacao e resumo_vendas, e peça ao gestor_trafego a análise de ontem vs últimos 7 dias e ao estrategista a projeção "se continuar assim" para 7 e 30 dias.
Formato (texto puro, cabe no celular):
1. Resumo em 3 linhas (como está o dia/semana).
2. Números: vendas, receita, gasto, ROAS, lucro estimado — com comparação.
3. O que eu (JARVIS) e a equipe fizemos nas últimas 24h e por quê.
4. Problemas e alertas (abertos e resolvidos).
5. Aprovações que esperam o Senhor.
6. Visão do alto: para onde a operação vai se nada mudar, e minhas 3 recomendações em ordem de prioridade.`;

export async function gerarRelatorioDiario(): Promise<string> {
  const texto = await perguntarAoJarvis(PROMPT_RELATORIO);
  await ReportModel.create({ tipo: "diario", conteudo: texto });
  await notificarDono(`📋 Relatório diário\n\n${texto}`);
  return texto;
}

function agoraLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.relatorio.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => partes.find((p) => p.type === t)?.value || "";
  return { data: `${get("year")}-${get("month")}-${get("day")}`, hora: Number(get("hour")) % 24 };
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

export function iniciarAgendador() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️ ANTHROPIC_API_KEY ausente: JARVIS desligado.");
    return;
  }
  const min = config.monitor.intervaloMin;
  setInterval(cicloDeMonitoramento, min * 60_000);
  setInterval(talvezRelatorio, 60_000);
  setTimeout(cicloDeMonitoramento, 30_000);
  console.log(`🧠 JARVIS online — monitorando a cada ${min} min, relatório diário às ${config.relatorio.hora}h (${config.relatorio.timezone}), autonomia: ${config.autonomia}.`);
}
