// Catálogo de ofertas: a ÚNICA fonte de links que o agente de recuperação pode enviar.
// O dono edita jarvis/catalogo.json (é relido a cada uso).

import fs from "fs";
import path from "path";

export type Oferta = {
  id: string;
  produto: string;
  nomesNaPlataforma?: string[]; // como o produto aparece no webhook, para casar a venda com a oferta
  tipo?: string; // principal, downsell, parcelado, cartao, bump, upsell...
  preco?: number;
  link: string;
  quandoUsar?: string; // instrução para o agente: "cliente achou caro", "prefere cartão"...
  descricao?: string;
  paraQuem?: string;
  garantia?: string;
  objecoes?: Record<string, string>; // objeção → resposta verdadeira
  faq?: Record<string, string>;
};

export type Catalogo = { atendente?: { nome?: string; empresa?: string; assinatura?: string }; ofertas: Oferta[] };

export function lerCatalogo(): Catalogo {
  const arquivo = path.resolve(process.env.JARVIS_CATALOGO_PATH || "jarvis/catalogo.json");
  try {
    const c = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    return { atendente: c.atendente || {}, ofertas: Array.isArray(c.ofertas) ? c.ofertas : [] };
  } catch (err) {
    console.error("⚠️ Não consegui ler o catálogo de ofertas:", (err as Error).message);
    return { ofertas: [] };
  }
}

export function buscarOferta(id: string): Oferta | undefined {
  return lerCatalogo().ofertas.find((o) => o.id === id);
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Descobre de qual produto do catálogo é a venda que chegou no webhook.
export function produtoDaVenda(nomeNaVenda?: string | null): string | null {
  if (!nomeNaVenda) return null;
  const alvo = normalizar(nomeNaVenda);
  for (const o of lerCatalogo().ofertas) {
    const nomes = [o.produto, ...(o.nomesNaPlataforma || [])].map(normalizar);
    if (nomes.some((n) => n && (alvo === n || alvo.includes(n) || n.includes(alvo)))) return o.produto;
  }
  return null;
}
