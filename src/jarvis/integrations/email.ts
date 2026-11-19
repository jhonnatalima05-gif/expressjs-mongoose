import { config } from "../config";

// Envio de e-mail via Resend (https://resend.com). Troque aqui se usar outro provedor.
export async function enviarEmail(para: string, assunto: string, texto: string): Promise<string> {
  const { resendApiKey, from } = config.email;
  if (!resendApiKey || !from) {
    throw new Error("E-mail não configurado (RESEND_API_KEY e JARVIS_EMAIL_FROM).");
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [para], subject: assunto, text: texto }),
  });
  const body = await resp.text();
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${body}`);
  return body;
}
