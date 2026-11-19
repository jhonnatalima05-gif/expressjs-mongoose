// Configuração central do JARVIS. Tudo vem de variáveis de ambiente para
// poder rodar no Railway (ou qualquer host) sem mexer no código.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type Autonomia = "supervisionada" | "total";

export const config = {
  // Modelos: o chefe pensa mais fundo; os especialistas executam.
  chiefModel: process.env.JARVIS_MODEL || "claude-opus-5-5",
  workerModel: process.env.JARVIS_WORKER_MODEL || "claude-opus-5-5",

  // "supervisionada": tudo que gasta dinheiro ou fala com cliente vai para aprovação.
  // "total": o JARVIS age sozinho DENTRO dos limites abaixo; acima deles, pede aprovação.
  autonomia: (process.env.JARVIS_AUTONOMIA === "total" ? "total" : "supervisionada") as Autonomia,

  // Botão de pânico: com true, o JARVIS só observa e avisa; nada é executado sem aprovação.
  pausado: false,

  limites: {
    // Maior variação de orçamento diário que o JARVIS pode aplicar sozinho, em % por ajuste.
    maxVariacaoOrcamentoPct: num("JARVIS_MAX_VARIACAO_ORCAMENTO_PCT", 20),
    // Maior orçamento diário (R$) que ele pode definir sem aprovação.
    maxOrcamentoDiario: num("JARVIS_MAX_ORCAMENTO_DIARIO", 300),
    // Reembolsos sempre pedem aprovação acima deste valor (R$). 0 = sempre pede.
    maxReembolsoAutomatico: num("JARVIS_MAX_REEMBOLSO_AUTOMATICO", 0),
  },

  monitor: {
    intervaloMin: num("JARVIS_MONITOR_INTERVALO_MIN", 15),
    roasMinimo: num("JARVIS_ROAS_MINIMO", 1.5),
    gastoMinimoParaJulgar: num("JARVIS_GASTO_MINIMO_PARA_JULGAR", 50),
    horasSemVendaAlerta: num("JARVIS_HORAS_SEM_VENDA_ALERTA", 4),
    horasTicketPendenteAlerta: num("JARVIS_HORAS_TICKET_PENDENTE_ALERTA", 6),
    // Quando há alerta crítico novo, acorda o JARVIS para investigar e agir sozinho.
    autoAcao: process.env.JARVIS_AUTO_ACAO !== "false",
  },

  relatorio: {
    hora: num("JARVIS_RELATORIO_HORA", 8), // hora local (America/Sao_Paulo)
    timezone: process.env.JARVIS_TIMEZONE || "America/Sao_Paulo",
  },

  meta: {
    accessToken: process.env.META_ACCESS_TOKEN || "",
    adAccountId: process.env.META_AD_ACCOUNT_ID || "", // sem o prefixo act_
    apiVersion: process.env.META_API_VERSION || "v25.0",
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    from: process.env.JARVIS_EMAIL_FROM || "",
  },

  // Protege as rotas /jarvis com um token simples (header x-jarvis-token).
  apiToken: process.env.JARVIS_API_TOKEN || "",

  outputDir: process.env.JARVIS_OUTPUT_DIR || "output",
};
