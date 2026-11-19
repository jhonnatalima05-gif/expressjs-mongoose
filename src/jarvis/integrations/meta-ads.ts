import { config } from "../config";

// Cliente mínimo da Marketing API da Meta (Facebook/Instagram Ads).

function base() {
  const { accessToken, adAccountId, apiVersion } = config.meta;
  if (!accessToken || !adAccountId) {
    throw new Error("Meta Ads não configurado (META_ACCESS_TOKEN e META_AD_ACCOUNT_ID).");
  }
  return { accessToken, adAccountId, url: `https://graph.facebook.com/${apiVersion}` };
}

async function graph(path: string, init?: RequestInit & { params?: Record<string, string> }) {
  const { accessToken, url } = base();
  const qs = new URLSearchParams({ ...(init?.params || {}), access_token: accessToken });
  const resp = await fetch(`${url}/${path}?${qs}`, init);
  const json: any = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(`Meta API: ${JSON.stringify(json.error || json)}`);
  }
  return json;
}

export type InsightCampanha = {
  id: string;
  nome: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpc: number;
  compras: number;
  receita: number;
  roas: number | null;
  cpa: number | null;
};

export async function insightsCampanhas(periodo: string = "today"): Promise<InsightCampanha[]> {
  const { adAccountId } = base();
  const json = await graph(`act_${adAccountId}/insights`, {
    params: {
      level: "campaign",
      date_preset: periodo, // today, yesterday, last_7d, last_30d...
      fields: "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions,action_values",
      limit: "200",
    },
  });
  return (json.data || []).map((r: any) => {
    const compras = Number(
      (r.actions || []).find((a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase")?.value || 0
    );
    const receita = Number(
      (r.action_values || []).find((a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase")
        ?.value || 0
    );
    const gasto = Number(r.spend || 0);
    return {
      id: r.campaign_id,
      nome: r.campaign_name,
      gasto,
      impressoes: Number(r.impressions || 0),
      cliques: Number(r.clicks || 0),
      ctr: Number(r.ctr || 0),
      cpc: Number(r.cpc || 0),
      compras,
      receita,
      roas: gasto > 0 ? receita / gasto : null,
      cpa: compras > 0 ? gasto / compras : null,
    };
  });
}

export async function lerCampanha(id: string) {
  return graph(id, { params: { fields: "id,name,status,daily_budget,lifetime_budget" } });
}

export async function alterarStatus(id: string, status: "ACTIVE" | "PAUSED") {
  return graph(id, { method: "POST", params: { status } });
}

// Orçamento em reais; a API usa centavos.
export async function alterarOrcamentoDiario(id: string, valorReais: number) {
  return graph(id, { method: "POST", params: { daily_budget: String(Math.round(valorReais * 100)) } });
}
