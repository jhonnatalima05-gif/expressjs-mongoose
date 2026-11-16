import Anthropic from "@anthropic-ai/sdk";
import type { BetaToolRunnerParams } from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";

// O SDK lê ANTHROPIC_API_KEY do ambiente.
export const client = new Anthropic();

type Ferramenta = BetaToolRunnerParams["tools"][number];

export type ExecucaoAgente = {
  nome: string;
  model: string;
  system: string;
  tools: Ferramenta[];
  prompt: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxIteracoes?: number;
};

// Roda um agente até ele terminar (chama ferramentas, lê resultados, decide de novo)
// e devolve o texto final.
export async function rodarAgente(e: ExecucaoAgente): Promise<string> {
  const inicio = Date.now();
  console.log(`🤖 [${e.nome}] começou: ${e.prompt.slice(0, 120)}`);

  const final = await client.beta.messages.toolRunner({
    model: e.model,
    max_tokens: 64000,
    stream: true,
    max_iterations: e.maxIteracoes ?? 25,
    // Envia o histórico completo a cada volta (o cache_control abaixo barateia a repetição).
    thread: false,
    // Se o modelo recusar por política, a API refaz automaticamente em outro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: e.effort },
    cache_control: { type: "ephemeral" },
    system: e.system,
    tools: e.tools,
    messages: [{ role: "user", content: e.prompt }],
  }).runUntilDone();

  const texto = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
  console.log(`✅ [${e.nome}] terminou em ${segundos}s (stop: ${final.stop_reason})`);

  if (final.stop_reason === "refusal") {
    return `[${e.nome}] recusou a tarefa por política de uso.`;
  }
  if (final.stop_reason === "max_tokens") {
    return `${texto}\n\n[${e.nome}: resposta cortada por limite de tamanho]`;
  }
  return texto || `[${e.nome}] terminou sem texto final (stop: ${final.stop_reason}).`;
}
