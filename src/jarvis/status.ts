// Checklist de configuração: o que já está ligado e o que falta (sem expor nenhum valor).

import mongoose from "mongoose";
import { config } from "./config";
import { lerCatalogo } from "./catalog";
import { perfilDoDono } from "./persona";

const tem = (...nomes: string[]) => nomes.every((n) => Boolean(process.env[n]));

export function checklist() {
  const catalogo = lerCatalogo();
  const catalogoExemplo = catalogo.ofertas.some((o) => /suaplataforma\.com/.test(o.link));
  const perfil = perfilDoDono();
  const perfilExemplo = /\[ex\.:/.test(perfil) || /R\$ \[ \]/.test(perfil);

  const itens = [
    { item: "Cérebro (Anthropic)", ok: tem("ANTHROPIC_API_KEY"), falta: "ANTHROPIC_API_KEY" },
    { item: "Banco de dados (MongoDB)", ok: mongoose.connection.readyState === 1, falta: "MONGO_URL (ou o banco está fora do ar)" },
    { item: "Senha da central/API", ok: tem("JARVIS_API_TOKEN"), falta: "JARVIS_API_TOKEN" },
    { item: "Telegram", ok: tem("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"), falta: "TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID" },
    { item: "Perfil do dono preenchido", ok: !perfilExemplo, falta: "editar jarvis/perfil-do-dono.md (ainda tem os exemplos)" },
    { item: "Catálogo com links reais", ok: catalogo.ofertas.length > 0 && !catalogoExemplo, falta: "editar jarvis/catalogo.json (ainda tem os links de exemplo)" },
    { item: "Webhook da Cakto validado", ok: tem("CAKTO_WEBHOOK_SECRET"), falta: "CAKTO_WEBHOOK_SECRET (só se usar Cakto)", opcional: true },
    { item: "Conversões da Meta (pixel)", ok: tem("META_PIXEL_ID", "META_ACCESS_TOKEN"), falta: "META_PIXEL_ID e META_ACCESS_TOKEN" },
    { item: "Anúncios (Meta Ads)", ok: tem("META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"), falta: "META_AD_ACCOUNT_ID" },
    { item: "WhatsApp (recuperação de PIX)", ok: tem("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"), falta: "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, META_APP_SECRET", opcional: true },
    { item: "Mineração (Apify)", ok: tem("APIFY_TOKEN"), falta: "APIFY_TOKEN" },
    { item: "E-mail (Resend)", ok: tem("RESEND_API_KEY", "JARVIS_EMAIL_FROM"), falta: "RESEND_API_KEY e JARVIS_EMAIL_FROM", opcional: true },
    { item: "Voz premium (ElevenLabs)", ok: tem("ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"), falta: "ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID", opcional: true },
  ];
  return {
    autonomia: config.autonomia,
    pausado: config.pausado,
    prontos: itens.filter((i) => i.ok).length,
    total: itens.length,
    itens,
  };
}

export function checklistTexto() {
  const c = checklist();
  const linhas = c.itens.map((i) => `${i.ok ? "✅" : i.opcional ? "⚪" : "❌"} ${i.item}${i.ok ? "" : i.opcional ? " (opcional, para depois)" : ` — falta: ${i.falta}`}`);
  return `🛠️ Configuração: ${c.prontos}/${c.total} prontos\nAutonomia: ${c.autonomia}${c.pausado ? " (PAUSADO)" : ""}\n\n${linhas.join("\n")}`;
}
