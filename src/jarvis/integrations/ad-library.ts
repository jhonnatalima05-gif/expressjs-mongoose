// Biblioteca de Anúncios da Meta: busca anúncios ativos e mede sinais de escala.
//
// Fontes (usa a primeira configurada):
// 1. Apify (APIFY_TOKEN): raspa a Biblioteca pública. É a que traz anúncios COMERCIAIS do Brasil.
// 2. API oficial (META_ACCESS_TOKEN): a Meta só devolve anúncios comerciais veiculados na UE/Reino Unido;
//    para o Brasil ela traz apenas anúncios políticos. Útil para ofertas em Portugal/Europa.

import { config } from "../config";

export type AnuncioBiblioteca = {
  id: string;
  anunciante: string;
  paginaId?: string;
  inicio?: string; // ISO
  ativo: boolean;
  texto: string;
  titulo?: string;
  link?: string;
  dominio?: string;
  plataformas?: string[];
  snapshot?: string;
};

export type GrupoOferta = {
  anunciante: string;
  dominios: string[];
  anunciosAtivos: number;
  diasAtivoMax: number;
  diasAtivoMediana: number;
  novosUltimos7d: number;
  variacoesDeTexto: number;
  score: number; // 0-10
  estagio: "escalada" | "validando" | "teste";
  sinais: string[];
  exemplosDeCopy: string[];
  linksBiblioteca: string[];
};

const DIA = 86400_000;

// ---------------------------------------------------------------- normalização

const primeiro = (...v: any[]) => v.find((x) => x !== undefined && x !== null && x !== "");

function paraIso(v: any): string | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function dominioDe(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    // Links de redirecionamento do Facebook carregam o destino real no parâmetro "u".
    const real = u.searchParams.get("u");
    return (real ? new URL(real) : u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url) ? url.toLowerCase().replace(/^www\./, "") : undefined;
  }
}

// Aceita os formatos mais comuns dos raspadores da Biblioteca e da API oficial.
export function normalizarAnuncio(r: any): AnuncioBiblioteca | null {
  const s = r?.snapshot || {};
  const card = Array.isArray(s.cards) ? s.cards[0] || {} : {};
  const id = String(primeiro(r.ad_archive_id, r.adArchiveID, r.adArchiveId, r.id, r.ad_id) ?? "");
  if (!id) return null;
  const texto = String(
    primeiro(
      s.body?.text,
      typeof s.body === "string" ? s.body : undefined,
      card.body,
      Array.isArray(r.ad_creative_bodies) ? r.ad_creative_bodies[0] : undefined,
      r.body,
      r.text,
      r.adText
    ) ?? ""
  );
  const link = primeiro(s.link_url, card.link_url, r.link_url, r.linkUrl, Array.isArray(r.ad_creative_link_captions) ? r.ad_creative_link_captions[0] : undefined, s.caption, card.caption);
  const ativoBruto = primeiro(r.is_active, r.isActive, r.active);
  return {
    id,
    anunciante: String(primeiro(r.page_name, r.pageName, s.page_name, r.advertiser, "desconhecido")),
    paginaId: primeiro(r.page_id, r.pageID, r.pageId, s.page_id)?.toString(),
    inicio: paraIso(primeiro(r.start_date, r.startDate, r.ad_delivery_start_time, r.startDateFormatted, r.start_date_string)),
    ativo: ativoBruto === undefined ? !primeiro(r.end_date, r.ad_delivery_stop_time) : Boolean(ativoBruto),
    texto: texto.replace(/\s+/g, " ").trim(),
    titulo: primeiro(s.title, card.title, Array.isArray(r.ad_creative_link_titles) ? r.ad_creative_link_titles[0] : undefined),
    link: typeof link === "string" ? link : undefined,
    dominio: dominioDe(typeof link === "string" ? link : undefined),
    plataformas: primeiro(r.publisher_platform, r.publisherPlatform, r.publisher_platforms),
    snapshot: primeiro(r.ad_snapshot_url, r.url, `https://www.facebook.com/ads/library/?id=${id}`),
  };
}

// ---------------------------------------------------------------- pontuação

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

// Agrupa por anunciante + domínio de destino (a mesma oferta) e dá uma nota de escala.
export function agruparEPontuar(anuncios: AnuncioBiblioteca[], agora = new Date()): GrupoOferta[] {
  const grupos = new Map<string, AnuncioBiblioteca[]>();
  for (const a of anuncios) {
    if (!a.ativo) continue;
    const chave = `${a.anunciante.toLowerCase()}|${a.dominio || "?"}`;
    grupos.set(chave, [...(grupos.get(chave) || []), a]);
  }

  const saida: GrupoOferta[] = [];
  for (const lista of grupos.values()) {
    const dias = lista.filter((a) => a.inicio).map((a) => Math.max(0, (agora.getTime() - new Date(a.inicio!).getTime()) / DIA));
    const diasAtivoMax = Math.round(Math.max(0, ...dias));
    const novos = dias.filter((d) => d <= 7).length;
    const variacoes = new Set(lista.map((a) => a.texto.toLowerCase().slice(0, 90)).filter(Boolean)).size;
    const n = lista.length;

    const sinais: string[] = [];
    let score = 0;
    // Longevidade: anúncio que fica no ar semanas está dando lucro.
    const pLong = diasAtivoMax >= 60 ? 3 : diasAtivoMax >= 30 ? 2.5 : diasAtivoMax >= 14 ? 1.5 : diasAtivoMax >= 7 ? 0.5 : 0;
    if (pLong) sinais.push(`anúncio mais antigo no ar há ${diasAtivoMax} dias`);
    // Volume: muitos anúncios ativos da mesma oferta = verba alta.
    const pVol = n >= 30 ? 3 : n >= 15 ? 2.5 : n >= 8 ? 2 : n >= 4 ? 1 : 0;
    if (pVol) sinais.push(`${n} anúncios ativos`);
    // Aceleração: criativos novos nesta semana = está escalando AGORA.
    const pAcel = novos >= 5 ? 2 : novos >= 2 ? 1 : 0;
    if (pAcel) sinais.push(`${novos} criativos novos nos últimos 7 dias`);
    // Diversidade: testando muitos ângulos/copys.
    const pDiv = variacoes >= 10 ? 2 : variacoes >= 5 ? 1.5 : variacoes >= 3 ? 1 : 0;
    if (pDiv) sinais.push(`${variacoes} variações de copy`);
    score = Math.min(10, pLong + pVol + pAcel + pDiv);

    const estagio = score >= 7 ? "escalada" : score >= 4 ? "validando" : "teste";
    saida.push({
      anunciante: lista[0].anunciante,
      dominios: [...new Set(lista.map((a) => a.dominio).filter(Boolean) as string[])],
      anunciosAtivos: n,
      diasAtivoMax,
      diasAtivoMediana: Math.round(mediana(dias)),
      novosUltimos7d: novos,
      variacoesDeTexto: variacoes,
      score: Math.round(score * 10) / 10,
      estagio,
      sinais,
      exemplosDeCopy: [...new Set(lista.map((a) => a.texto).filter(Boolean))].slice(0, 3).map((t) => t.slice(0, 400)),
      linksBiblioteca: lista.slice(0, 3).map((a) => a.snapshot || ""),
    });
  }
  return saida.sort((a, b) => b.score - a.score || b.anunciosAtivos - a.anunciosAtivos);
}

// ---------------------------------------------------------------- fontes

export function fonteConfigurada(): "apify" | "meta" | null {
  if (process.env.APIFY_TOKEN) return "apify";
  if (config.meta.accessToken) return "meta";
  return null;
}

export function urlBiblioteca(termo: string, pais = "BR") {
  const qs = new URLSearchParams({ active_status: "active", ad_type: "all", country: pais, q: termo, search_type: "keyword_unordered", media_type: "all" });
  return `https://www.facebook.com/ads/library/?${qs}`;
}

async function buscarApify(termo: string, pais: string, limite: number): Promise<any[]> {
  const ator = (process.env.APIFY_ADS_ACTOR || "curious_coder~facebook-ads-library-scraper").replace("/", "~");
  const resp = await fetch(
    `https://api.apify.com/v2/acts/${ator}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=240`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [{ url: urlBiblioteca(termo, pais) }], count: limite, "scrapePageAds.activeStatus": "active" }),
    }
  );
  const json: any = await resp.json().catch(() => null);
  if (!resp.ok || !Array.isArray(json)) throw new Error(`Apify ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function buscarMeta(termo: string, pais: string, limite: number): Promise<any[]> {
  const qs = new URLSearchParams({
    search_terms: termo,
    ad_reached_countries: JSON.stringify([pais]),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    limit: String(Math.min(limite, 250)),
    fields: "id,page_id,page_name,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_snapshot_url,publisher_platforms",
    access_token: config.meta.accessToken,
  });
  const resp = await fetch(`https://graph.facebook.com/${config.meta.apiVersion}/ads_archive?${qs}`);
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || json.error) {
    throw new Error(
      `API da Biblioteca da Meta: ${JSON.stringify(json.error || json).slice(0, 300)}. ` +
        "Lembrete: para o Brasil a API oficial só traz anúncios políticos; use APIFY_TOKEN para anúncios comerciais."
    );
  }
  return json.data || [];
}

export async function pesquisarBiblioteca(termo: string, pais = "BR", limite = 200) {
  const fonte = fonteConfigurada();
  if (!fonte) {
    return {
      fonte: null,
      erro: "Nenhuma fonte da Biblioteca configurada (APIFY_TOKEN ou META_ACCESS_TOKEN).",
      urlManual: urlBiblioteca(termo, pais),
    };
  }
  const brutos = fonte === "apify" ? await buscarApify(termo, pais, limite) : await buscarMeta(termo, pais, limite);
  const anuncios = brutos.map(normalizarAnuncio).filter(Boolean) as AnuncioBiblioteca[];
  const grupos = agruparEPontuar(anuncios);
  return {
    fonte,
    termo,
    pais,
    anunciosLidos: anuncios.length,
    ofertasEncontradas: grupos.length,
    ofertas: grupos.slice(0, 25),
    urlManual: urlBiblioteca(termo, pais),
    ...(fonte === "meta" && pais === "BR" && !anuncios.length
      ? { aviso: "A API oficial não traz anúncios comerciais do Brasil. Configure APIFY_TOKEN." }
      : {}),
  };
}
