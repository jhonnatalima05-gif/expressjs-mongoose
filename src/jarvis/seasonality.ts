// Calendário de oportunidades: diz o que está em alta agora e o que precisa começar a ser preparado.

import fs from "fs";
import path from "path";

export type Janela = {
  id: string;
  nome: string;
  inicio: string; // MM-DD
  fim: string; // MM-DD
  antecedenciaDias: number;
  nichos: string[];
  angulos?: string[];
  custoAnuncio?: string;
  observacao?: string;
};

export type JanelaAvaliada = Janela & {
  situacao: "ativa" | "preparar_agora" | "futura";
  comecaEm: string;
  terminaEm: string;
  diasAteInicio: number;
  diasAteFim: number;
  ofertaProntaAte: string;
};

export function lerCalendario(): Janela[] {
  const arquivo = path.resolve(process.env.JARVIS_CALENDARIO_PATH || "jarvis/calendario-sazonal.json");
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8")).janelas || [];
  } catch (err) {
    console.error("⚠️ Não consegui ler o calendário sazonal:", (err as Error).message);
    return [];
  }
}

const DIA = 86400_000;
const DIAS_PARA_CRIAR = Number(process.env.JARVIS_DIAS_PARA_CRIAR_OFERTA || 30);
const data = (ano: number, mmdd: string) => {
  const [m, d] = mmdd.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, d));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

// A ocorrência da janela que ainda não acabou (a atual ou a próxima). Lida com janelas que viram o ano.
function proximaOcorrencia(j: Janela, hoje: Date) {
  for (const ano of [hoje.getUTCFullYear() - 1, hoje.getUTCFullYear(), hoje.getUTCFullYear() + 1]) {
    const inicio = data(ano, j.inicio);
    let fim = data(ano, j.fim);
    if (fim < inicio) fim = data(ano + 1, j.fim);
    if (fim.getTime() + DIA > hoje.getTime()) return { inicio, fim };
  }
  return null;
}

export function oportunidades(hoje = new Date(), horizonteDias = 150): JanelaAvaliada[] {
  const h = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const saida: JanelaAvaliada[] = [];
  for (const j of lerCalendario()) {
    const oc = proximaOcorrencia(j, h);
    if (!oc) continue;
    const diasAteInicio = Math.round((oc.inicio.getTime() - h.getTime()) / DIA);
    const diasAteFim = Math.round((oc.fim.getTime() - h.getTime()) / DIA);
    if (diasAteInicio > horizonteDias) continue;
    // "preparar_agora": dentro do tempo de criar o produto (DIAS_PARA_CRIAR) + testar antes do pico (antecedência).
    const situacao = diasAteInicio <= 0 ? "ativa" : diasAteInicio <= j.antecedenciaDias + DIAS_PARA_CRIAR ? "preparar_agora" : "futura";
    saida.push({
      ...j,
      situacao,
      comecaEm: iso(oc.inicio),
      terminaEm: iso(oc.fim),
      diasAteInicio,
      diasAteFim,
      ofertaProntaAte: iso(new Date(oc.inicio.getTime() - j.antecedenciaDias * DIA)),
    });
  }
  const ordem = { ativa: 0, preparar_agora: 1, futura: 2 };
  return saida.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.diasAteInicio - b.diasAteInicio);
}
