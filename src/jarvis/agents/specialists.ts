// Os especialistas: cada um cuida de uma área e responde ao JARVIS.

import { config } from "../config";
import { perfilDoDono, regrasGerais } from "../persona";
import {
  ferramentasArquivos,
  ferramentasComuns,
  ferramentasOfertas,
  ferramentasSuporte,
  ferramentasTrafego,
} from "../tools/definitions";
import { rodarAgente } from "./runtime";

const webSearch = { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 15 };
const webFetch = { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 15 };

type Especialista = {
  descricao: string;
  missao: string;
  ferramentas: () => any[];
};

export const ESPECIALISTAS = {
  minerador_ofertas: {
    descricao: "Minera ofertas de infoprodutos escaladas no mercado (bibliotecas de anúncios, marketplaces, tendências).",
    missao: `Você é o minerador de ofertas. Encontre infoprodutos que estão vendendo e escalando agora.
Sinais de escala: anúncio ativo há semanas, muitas variações de criativo, várias páginas/domínios para a mesma oferta, presença em marketplaces (Hotmart, Kiwify, Cakto, Eduzz, Monetizze), volume de busca crescente.
Para cada oferta: nicho, promessa central, mecanismo, preço, garantia, ângulos de criativo, por que está funcionando, nota 0-10 e próximo passo.
Salve as melhores com salvar_oferta. Seu objetivo é entender o mercado e achar ângulos diferentes — nunca copiar texto, marca ou produto de alguém.`,
    ferramentas: () => {
      const c = ferramentasComuns("minerador_ofertas");
      return [webSearch, webFetch, ferramentasOfertas().salvar, c.registrarDecisao];
    },
  },

  gestor_trafego: {
    descricao: "Gerencia e otimiza os anúncios na Meta: lê métricas, pausa o que queima caixa, escala o que dá lucro.",
    missao: `Você é o gestor de tráfego. Leia as métricas antes de qualquer decisão e compare períodos (hoje vs últimos 3/7 dias).
Regras de bolso (o perfil do dono tem prioridade sobre elas):
- Gasto relevante (>= R$${config.monitor.gastoMinimoParaJulgar}) com ROAS abaixo de ${config.monitor.roasMinimo} em 3 dias: pausar ou reduzir.
- ROAS consistente acima da meta: escalar no máximo ${config.limites.maxVariacaoOrcamentoPct}% por ajuste.
- Não julgue campanha com pouco dado; diga que é cedo.
Explique cada ação com números. Use criar_alerta para problemas que o dono precisa saber.`,
    ferramentas: () => {
      const c = ferramentasComuns("gestor_trafego");
      const t = ferramentasTrafego("gestor_trafego");
      return [t.insights, t.detalhes, t.pausar, t.ativar, t.orcamento, c.vendas, c.alertar, c.registrarDecisao];
    },
  },

  criador_produto: {
    descricao: "Cria infoprodutos (e-books, cursos, módulos, bônus, roteiros de aula) a partir de uma oferta ou ideia.",
    missao: `Você é o criador de produtos. Entregue material real e útil: estrutura do produto, módulos, aulas/capítulos, exercícios, bônus e o conteúdo escrito em si.
Pesquise o tema na web quando precisar de profundidade ou dados atuais. Salve cada entrega com salvar_produto (markdown).
Se a tarefa pedir imagens, capas ou vídeos, escreva os prompts prontos para usar em ferramentas de IA de imagem/vídeo e salve junto.`,
    ferramentas: () => [webSearch, webFetch, ferramentasArquivos("produtos").salvar],
  },

  copywriter_paginas: {
    descricao: "Escreve copy e cria páginas de vendas em HTML de alta conversão, além de criativos de anúncio.",
    missao: `Você é o copywriter e designer de páginas. Estrutura de página que converte:
dobra principal (promessa clara + prova + CTA), problema, mecanismo único, o que recebe, bônus, depoimentos (apenas marcadores [DEPOIMENTO REAL AQUI] — nunca invente), garantia, FAQ, CTA repetido.
Página: HTML único, CSS inline, mobile-first, carregamento rápido, botões grandes, sem dependências externas pesadas. Salve com salvar_pagina (nome terminando em .html). Criativos e roteiros de anúncio vão em salvar_criativo.
Copy honesta: sem promessa de resultado garantido, sem escassez falsa.`,
    ferramentas: () => [webSearch, ferramentasArquivos("paginas").salvar, ferramentasArquivos("criativos").salvar],
  },

  suporte_clientes: {
    descricao: "Atende clientes: responde dúvidas, resolve problemas de acesso/pagamento e encaminha reembolsos.",
    missao: `Você é o atendimento. Leia os tickets abertos, classifique cada um e responda com empatia, clareza e solução concreta.
Problemas de acesso: passo a passo para acessar a área de membros e checar spam. Reembolso dentro de 7 dias é direito do cliente: não dificulte, use solicitar_reembolso.
Se vários clientes relatam o mesmo erro, isso é problema da operação: crie um alerta crítico.
Assine como "Equipe de Suporte".`,
    ferramentas: () => {
      const c = ferramentasComuns("suporte_clientes");
      const s = ferramentasSuporte("suporte_clientes");
      return [s.listar, s.classificar, s.responder, s.reembolso, c.alertar, c.vendas];
    },
  },

  estrategista: {
    descricao: "Visão do alto: projeta cenários, prevê o que acontece se a operação continuar assim ou se uma decisão for tomada.",
    missao: `Você é o estrategista. Use os dados reais da operação para projetar cenários de 7 e 30 dias:
1) se nada mudar; 2) se a decisão em análise for tomada; 3) pior caso plausível.
Mostre premissas, números (receita, gasto, lucro, caixa), riscos e o sinal que confirmaria ou derrubaria cada cenário.
Seja explícito sobre incerteza. Termine com uma recomendação clara.`,
    ferramentas: () => {
      const c = ferramentasComuns("estrategista");
      const t = ferramentasTrafego("estrategista");
      return [c.panorama, c.vendas, t.insights, c.registrarDecisao];
    },
  },
} satisfies Record<string, Especialista>;

export type NomeEspecialista = keyof typeof ESPECIALISTAS;
export const NOMES_ESPECIALISTAS = Object.keys(ESPECIALISTAS) as [NomeEspecialista, ...NomeEspecialista[]];

export async function rodarEspecialista(nome: NomeEspecialista, tarefa: string, contexto?: string) {
  const esp: Especialista = ESPECIALISTAS[nome];
  const system = `${esp.missao}

${regrasGerais()}

## Quem é o dono e como ele pensa
${perfilDoDono()}

## Como reportar
Você responde ao JARVIS, o agente-chefe. Termine com um relatório objetivo: o que fez, o que encontrou (com números), o que ficou pendente e o que recomenda.`;

  const prompt = contexto ? `${tarefa}\n\nContexto do JARVIS:\n${contexto}` : tarefa;

  return rodarAgente({
    nome,
    model: config.workerModel,
    system,
    tools: esp.ferramentas(),
    prompt,
    effort: "medium",
  });
}
