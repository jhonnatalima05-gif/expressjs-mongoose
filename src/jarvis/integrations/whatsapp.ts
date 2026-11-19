// WhatsApp Cloud API oficial da Meta.
// Regra importante do WhatsApp: a EMPRESA só pode iniciar conversa (ou mandar mensagem
// depois de 24h sem resposta do cliente) usando um TEMPLATE aprovado pela Meta.
// Depois que o cliente responde, abre-se uma janela de 24h para mensagens livres.

import crypto from "crypto";

const env = () => ({
  token: process.env.WHATSAPP_TOKEN || "",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  apiVersion: process.env.META_API_VERSION || "v25.0",
  appSecret: process.env.META_APP_SECRET || "",
  base: process.env.WHATSAPP_API_BASE || "https://graph.facebook.com",
});

export const JANELA_24H_MS = 24 * 3600_000;

export function whatsappConfigurado() {
  const e = env();
  return Boolean(e.token && e.phoneNumberId);
}

// Normaliza para o formato internacional só com dígitos (Brasil: 55 + DDD + número).
export function normalizarTelefone(bruto?: string | null): string | null {
  let d = String(bruto || "").replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

async function enviar(corpo: Record<string, unknown>) {
  const e = env();
  if (!e.token || !e.phoneNumberId) throw new Error("WhatsApp não configurado (WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID).");
  const resp = await fetch(`${e.base}/${e.apiVersion}/${e.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${e.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || json.error) throw new Error(`WhatsApp ${resp.status}: ${JSON.stringify(json.error || json)}`);
  return json;
}

export function enviarTexto(telefone: string, texto: string) {
  return enviar({ to: telefone, type: "text", text: { body: texto, preview_url: true } });
}

export function enviarTemplate(telefone: string, nome: string, parametros: string[], idioma = "pt_BR") {
  return enviar({
    to: telefone,
    type: "template",
    template: {
      name: nome,
      language: { code: idioma },
      components: parametros.length
        ? [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}

// Confere a assinatura X-Hub-Signature-256 que a Meta manda no webhook.
export function assinaturaValida(rawBody: Buffer | undefined, assinatura: string | undefined): boolean {
  const { appSecret } = env();
  if (!appSecret) return true; // sem segredo configurado, não dá para validar (configure META_APP_SECRET)
  if (!rawBody || !assinatura) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type MensagemRecebida = { telefone: string; nome?: string; texto: string; id: string };

// Extrai as mensagens de texto do payload do webhook da Meta.
export function extrairMensagens(body: any): MensagemRecebida[] {
  const saida: MensagemRecebida[] = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const v = change?.value || {};
      const nomes: Record<string, string> = {};
      for (const c of v.contacts || []) nomes[c.wa_id] = c.profile?.name;
      for (const m of v.messages || []) {
        let texto = "";
        if (m.type === "text") texto = m.text?.body || "";
        else if (m.type === "button") texto = m.button?.text || "";
        else if (m.type === "interactive") texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
        else texto = `[cliente enviou ${m.type} — não consigo ver; peça para escrever]`;
        if (m.from) saida.push({ telefone: m.from, nome: nomes[m.from], texto, id: m.id });
      }
    }
  }
  return saida;
}
