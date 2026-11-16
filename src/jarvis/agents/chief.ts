// O JARVIS: agente-chefe que pensa, decide, delega e reporta.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config";
import { perfilDoDono, regrasGerais, VOZ_JARVIS } from "../persona";
import { ferramentasChefe, ferramentasComuns, ferramentasOfertas } from "../tools/definitions";
import { ESPECIALISTAS, NOMES_ESPECIALISTAS, rodarEspecialista } from "./specialists";
import { rodarAgente } from "./runtime";

const equipe = Object.entries(ESPECIALISTAS)
  .map(([nome, e]) => `- ${nome}: ${e.descricao}`)
  .join("\n");

function systemChefe() {
  return `${VOZ_JARVIS}

## Seu papel
Você é o agente-chefe de uma operação de vendas de infoprodutos. Você pensa como o dono pensaria (veja o perfil e a memória dele), toma decisões dentro da sua autonomia e comanda uma equipe de agentes especialistas:
${equipe}

Como trabalhar:
1. Comece entendendo a situação com dados (panorama_operacao) — nunca decida no escuro.
2. Antes de decisões importantes, consulte memoria_do_dono.
3. Delegue o trabalho de execução ao especialista certo, com uma tarefa clara e o contexto necessário. Para problemas que cruzam áreas, delegue para vários (em paralelo quando forem independentes) e junte as conclusões.
4. Pense no calendário: use calendario_oportunidades para antecipar as próximas janelas do ano (o que criar agora para estar pronto no pico, quando escalar, quando o custo de anúncio sobe).
5. Pense em consequências: para decisões relevantes, peça ao estrategista a projeção de cenários antes de agir.
6. Problemas: resolva o que estiver ao seu alcance; o que o dono precisa saber vira alerta. Só incomode o dono com o que realmente importa.
7. Quando o dono corrigir, aprovar ou rejeitar algo, guarde o aprendizado com aprender_sobre_dono.

${regrasGerais()}

## Perfil do dono (escrito por ele)
${perfilDoDono()}`;
}

function ferramentas() {
  const c = ferramentasComuns("jarvis");
  const chefe = ferramentasChefe();

  const delegar = betaZodTool({
    name: "delegar_para_agente",
    description:
      "Envia uma tarefa a um agente especialista e recebe o relatório dele. Pode chamar várias vezes em paralelo para agentes diferentes.",
    inputSchema: z.object({
      agente: z.enum(NOMES_ESPECIALISTAS),
      tarefa: z.string().describe("O que fazer, com critério claro de 'pronto'."),
      contexto: z.string().optional().describe("Dados e decisões que o especialista precisa saber."),
    }),
    run: async ({ agente, tarefa, contexto }) => {
      try {
        return await rodarEspecialista(agente, tarefa, contexto);
      } catch (err: any) {
        return `O agente ${agente} falhou: ${err?.message || err}`;
      }
    },
  });

  return [
    c.panorama,
    c.vendas,
    ferramentasOfertas().calendario,
    delegar,
    c.alertar,
    c.resolverAlerta,
    c.registrarDecisao,
    chefe.notificar,
    chefe.lerMemoria,
    chefe.salvarMemoria,
  ];
}

// Fila simples: uma execução do chefe por vez, para não tomar decisões conflitantes.
let fila: Promise<unknown> = Promise.resolve();

export function perguntarAoJarvis(mensagem: string): Promise<string> {
  const execucao = fila.then(() =>
    rodarAgente({
      nome: "jarvis",
      model: config.chiefModel,
      system: systemChefe(),
      tools: ferramentas(),
      prompt: mensagem,
      effort: "high",
      maxIteracoes: 40,
    })
  );
  fila = execucao.catch(() => undefined);
  return execucao;
}
