// Ferramentas que os agentes podem chamar. Cada agente recebe só as que precisa.

import fs from "fs/promises";
import path from "path";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config";
import { DecisionModel, OfferModel, OwnerMemoryModel, TicketModel } from "../models";
import { alertar, resolverAlerta } from "../alerts";
import { notificarDono } from "../integrations/telegram";
import * as meta from "../integrations/meta-ads";
import { panorama, resumoAnuncios, resumoSuporte, resumoVendas } from "./operation";
import { solicitarAcao } from "./actions";
import { pesquisarBiblioteca } from "../integrations/ad-library";
import { oportunidades } from "../seasonality";

const json = (v: unknown) => JSON.stringify(v, null, 2);

// Grava arquivos só dentro da pasta de saída, nunca fora dela.
async function salvarArquivo(subpasta: string, nome: string, conteudo: string) {
  const raiz = path.resolve(config.outputDir, subpasta);
  const seguro = nome.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+/, "");
  const destino = path.resolve(raiz, seguro);
  if (!destino.startsWith(raiz + path.sep)) throw new Error("Nome de arquivo inválido.");
  await fs.mkdir(raiz, { recursive: true });
  await fs.writeFile(destino, conteudo, "utf8");
  return path.relative(process.cwd(), destino);
}

export function ferramentasComuns(agente: string) {
  return {
    panorama: betaZodTool({
      name: "panorama_operacao",
      description:
        "Visão geral da operação agora: vendas 24h e 7d, anúncios de hoje, suporte, alertas abertos, aprovações pendentes, últimas decisões e ofertas mineradas.",
      inputSchema: z.object({}),
      run: async () => json(await panorama()),
    }),

    vendas: betaZodTool({
      name: "resumo_vendas",
      description: "Vendas das últimas N horas (aprovadas, receita, por produto, última venda).",
      inputSchema: z.object({ horas: z.number().min(1).max(24 * 90) }),
      run: async ({ horas }) => json(await resumoVendas(horas)),
    }),

    alertar: betaZodTool({
      name: "criar_alerta",
      description:
        "Registra um problema e avisa o dono no celular (níveis atencao/critico). Use uma 'chave' estável por problema para não repetir o aviso.",
      inputSchema: z.object({
        chave: z.string(),
        nivel: z.enum(["info", "atencao", "critico"]),
        area: z.string().describe("vendas, trafego, suporte, produto, pagina, sistema..."),
        titulo: z.string(),
        detalhe: z.string(),
      }),
      run: async (a) => ((await alertar(a)) ? "Alerta criado." : "Esse alerta já estava aberto."),
    }),

    resolverAlerta: betaZodTool({
      name: "resolver_alerta",
      description: "Marca um alerta como resolvido (por id ou chave).",
      inputSchema: z.object({ id_ou_chave: z.string() }),
      run: async ({ id_ou_chave }) => {
        await resolverAlerta(id_ou_chave);
        return "Resolvido.";
      },
    }),

    registrarDecisao: betaZodTool({
      name: "registrar_decisao",
      description:
        "Registra no diário uma decisão estratégica (que não é uma ação executável), com motivo e impacto esperado, para o dono poder auditar depois.",
      inputSchema: z.object({ decisao: z.string(), motivo: z.string(), impacto_esperado: z.string() }),
      run: async (d) => {
        await DecisionModel.create({ agente, decisao: d.decisao, motivo: d.motivo, impactoEsperado: d.impacto_esperado });
        return "Decisão registrada.";
      },
    }),
  };
}

export function ferramentasChefe() {
  return {
    notificar: betaZodTool({
      name: "notificar_dono",
      description: "Manda uma mensagem direta para o celular do dono (Telegram). Use com parcimônia: só o que importa.",
      inputSchema: z.object({ mensagem: z.string() }),
      run: async ({ mensagem }) => ((await notificarDono(mensagem)) ? "Enviado." : "Telegram não configurado; mensagem só no log."),
    }),

    lerMemoria: betaZodTool({
      name: "memoria_do_dono",
      description:
        "Lê os aprendizados acumulados sobre como o dono pensa e decide (preferências, o que aprovou/rejeitou). Consulte antes de decisões importantes.",
      inputSchema: z.object({ limite: z.number().min(1).max(200).optional() }),
      run: async ({ limite }) => {
        const itens = await OwnerMemoryModel.find().sort({ createdAt: -1 }).limit(limite || 50).lean();
        return itens.length ? itens.map((m: any) => `- ${m.aprendizado}`).join("\n") : "Nenhum aprendizado registrado ainda.";
      },
    }),

    salvarMemoria: betaZodTool({
      name: "aprender_sobre_dono",
      description:
        "Guarda um aprendizado duradouro sobre como o dono pensa (ex.: 'prefere escalar devagar, 20% por dia'). Use quando ele corrigir, aprovar ou rejeitar algo.",
      inputSchema: z.object({ aprendizado: z.string(), origem: z.string() }),
      run: async (m) => {
        await OwnerMemoryModel.create(m);
        return "Aprendizado guardado.";
      },
    }),
  };
}

export function ferramentasTrafego(agente: string) {
  return {
    insights: betaZodTool({
      name: "metricas_anuncios",
      description: "Métricas das campanhas da Meta por período (gasto, CTR, CPC, compras, receita, ROAS, CPA).",
      inputSchema: z.object({
        periodo: z.enum(["today", "yesterday", "last_3d", "last_7d", "last_14d", "last_30d"]),
      }),
      run: async ({ periodo }) => json(await resumoAnuncios(periodo)),
    }),

    pausar: betaZodTool({
      name: "pausar_campanha",
      description: "Pausa uma campanha/conjunto/anúncio da Meta pelo ID. Proteção de caixa: pode ser feito sem aprovação no modo total.",
      inputSchema: z.object({ id: z.string(), motivo: z.string() }),
      run: async ({ id, motivo }) => solicitarAcao({ tipo: "pausar_campanha", id, motivo }, agente),
    }),

    ativar: betaZodTool({
      name: "ativar_campanha",
      description: "Ativa uma campanha/conjunto/anúncio pausado. Sempre passa por aprovação do dono.",
      inputSchema: z.object({ id: z.string(), motivo: z.string() }),
      run: async ({ id, motivo }) => solicitarAcao({ tipo: "ativar_campanha", id, motivo }, agente),
    }),

    orcamento: betaZodTool({
      name: "ajustar_orcamento",
      description:
        "Define o novo orçamento diário (R$) de uma campanha ou conjunto com orçamento diário. Dentro dos limites roda sozinho; acima, vira pedido de aprovação.",
      inputSchema: z.object({ id: z.string(), novo_orcamento_reais: z.number().positive(), motivo: z.string() }),
      run: async ({ id, novo_orcamento_reais, motivo }) =>
        solicitarAcao({ tipo: "ajustar_orcamento", id, novoOrcamento: novo_orcamento_reais, motivo }, agente),
    }),

    detalhes: betaZodTool({
      name: "detalhes_campanha",
      description: "Status e orçamento atual de uma campanha/conjunto.",
      inputSchema: z.object({ id: z.string() }),
      run: async ({ id }) => json(await meta.lerCampanha(id)),
    }),
  };
}

export function ferramentasSuporte(agente: string) {
  return {
    listar: betaZodTool({
      name: "tickets_abertos",
      description: "Lista mensagens de clientes ainda não resolvidas.",
      inputSchema: z.object({}),
      run: async () => json(await resumoSuporte()),
    }),

    responder: betaZodTool({
      name: "responder_cliente",
      description:
        "Responde um ticket por e-mail. No modo supervisionado vira rascunho aguardando aprovação.",
      inputSchema: z.object({ ticket_id: z.string(), resposta: z.string(), motivo: z.string() }),
      run: async ({ ticket_id, resposta, motivo }) =>
        solicitarAcao({ tipo: "responder_ticket", ticketId: ticket_id, resposta, motivo }, agente),
    }),

    classificar: betaZodTool({
      name: "classificar_ticket",
      description: "Define a categoria de um ticket (acesso, pagamento, reembolso, duvida_produto, bug, outro) ou fecha-o.",
      inputSchema: z.object({
        ticket_id: z.string(),
        categoria: z.enum(["acesso", "pagamento", "reembolso", "duvida_produto", "bug", "outro"]),
        fechar: z.boolean().optional(),
      }),
      run: async ({ ticket_id, categoria, fechar }) => {
        await TicketModel.findByIdAndUpdate(ticket_id, { categoria, ...(fechar ? { status: "fechado" } : {}) });
        return "Ok.";
      },
    }),

    reembolso: betaZodTool({
      name: "solicitar_reembolso",
      description: "Pede reembolso para um cliente. Sempre vai para aprovação do dono acima do limite configurado.",
      inputSchema: z.object({ ticket_id: z.string(), valor: z.number().nonnegative(), motivo: z.string() }),
      run: async ({ ticket_id, valor, motivo }) =>
        solicitarAcao({ tipo: "reembolso", ticketId: ticket_id, valor, motivo }, agente),
    }),
  };
}

export function ferramentasOfertas() {
  return {
    calendario: betaZodTool({
      name: "calendario_oportunidades",
      description:
        "Janelas sazonais do mercado brasileiro a partir de hoje: as ATIVAS, as que é preciso PREPARAR AGORA (dentro da antecedência) e as futuras, com nichos, ângulos e o custo de anúncio da época.",
      inputSchema: z.object({ horizonte_dias: z.number().min(30).max(365).optional() }),
      run: async ({ horizonte_dias }) => json({ hoje: new Date().toISOString().slice(0, 10), janelas: oportunidades(new Date(), horizonte_dias || 150) }),
    }),

    biblioteca: betaZodTool({
      name: "biblioteca_anuncios",
      description:
        "Pesquisa a Biblioteca de Anúncios da Meta por palavra-chave e devolve as ofertas agrupadas (anunciante + domínio da página) com sinais de escala calculados: anúncios ativos, dias no ar, criativos novos em 7 dias, variações de copy, nota de escala 0-10 e estágio (escalada/validando/teste). Faça várias buscas com termos diferentes do nicho (promessa, dor, mecanismo, público).",
      inputSchema: z.object({
        termo: z.string().describe("Palavra-chave como o anunciante escreveria: ex. 'ovos de páscoa renda extra', 'curso de confeitaria'."),
        pais: z.string().length(2).optional().describe("Código do país, padrão BR."),
        limite: z.number().min(20).max(500).optional(),
      }),
      run: async ({ termo, pais, limite }) => {
        try {
          return json(await pesquisarBiblioteca(termo, (pais || "BR").toUpperCase(), limite || 200));
        } catch (err: any) {
          return `Falha ao consultar a Biblioteca: ${err?.message || err}`;
        }
      },
    }),

    jaMineradas: betaZodTool({
      name: "ofertas_ja_mineradas",
      description: "Ofertas já salvas antes (para não repetir e para ver se uma oferta continua no ar).",
      inputSchema: z.object({ nicho: z.string().optional() }),
      run: async ({ nicho }) => {
        const filtro = nicho ? { nicho: new RegExp(nicho.replace(/[.*+?^${}()|[\]\\]/g, ""), "i") } : {};
        const itens = await OfferModel.find(filtro).sort({ createdAt: -1 }).limit(40).lean();
        return json(itens.map((o: any) => ({ nome: o.nome, nicho: o.nicho, anunciante: o.anunciante, nota: o.nota, estagio: o.estagio, janela: o.janelaSazonal, em: o.createdAt })));
      },
    }),

    salvar: betaZodTool({
      name: "salvar_oferta",
      description:
        "Salva uma oferta minerada: evidências da Biblioteca, encaixe sazonal e a MODELAGEM (a versão própria do dono, original).",
      inputSchema: z.object({
        nicho: z.string(),
        nome: z.string().describe("Nome descritivo da oferta observada."),
        anunciante: z.string(),
        promessa: z.string(),
        evidencias: z.string().describe("Sinais de escala com números da Biblioteca."),
        links: z.array(z.string()),
        score_escala: z.number().min(0).max(10).describe("O score calculado pela Biblioteca."),
        estagio: z.enum(["escalada", "validando", "teste"]),
        anuncios_ativos: z.number(),
        dias_ativo_max: z.number(),
        janela_sazonal: z.string().describe("id da janela do calendário, ou 'perene'."),
        melhor_epoca: z.string().describe("Quando lançar/escalar e quando a oferta perde força."),
        nota: z.number().min(0).max(10).describe("Nota final: escala x momento do ano x concorrência x encaixe com o dono."),
        modelagem: z.string().describe("A oferta própria modelada: avatar, promessa, mecanismo, entregáveis, preço, bônus, garantia, 3 ângulos de criativo. Original."),
        proximo_passo: z.string(),
      }),
      run: async (o) => {
        const doc = await OfferModel.create({
          nicho: o.nicho,
          nome: o.nome,
          anunciante: o.anunciante,
          promessa: o.promessa,
          evidencias: o.evidencias,
          links: o.links,
          scoreEscala: o.score_escala,
          estagio: o.estagio,
          anunciosAtivos: o.anuncios_ativos,
          diasAtivoMax: o.dias_ativo_max,
          janelaSazonal: o.janela_sazonal,
          melhorEpoca: o.melhor_epoca,
          nota: o.nota,
          modelagem: o.modelagem,
          proximoPasso: o.proximo_passo,
        });
        return `Oferta salva (${doc.id}).`;
      },
    }),
  };
}

export function ferramentasArquivos(subpasta: "produtos" | "paginas" | "criativos") {
  return {
    salvar: betaZodTool({
      name: { produtos: "salvar_produto", paginas: "salvar_pagina", criativos: "salvar_criativo" }[subpasta],
      description:
        subpasta === "paginas"
          ? "Salva uma página de vendas completa em HTML (arquivo .html autossuficiente, CSS inline, mobile-first). Ela fica disponível em /jarvis/paginas/<nome>."
          : `Salva um arquivo (markdown/texto) na pasta ${subpasta}.`,
      inputSchema: z.object({ nome_arquivo: z.string(), conteudo: z.string() }),
      run: async ({ nome_arquivo, conteudo }) => `Salvo em ${await salvarArquivo(subpasta, nome_arquivo, conteudo)}`,
    }),
  };
}
