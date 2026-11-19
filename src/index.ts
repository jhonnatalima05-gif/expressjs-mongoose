import "./lib/db";
import express from "express";
import crypto from "crypto";
import countryRoutes from "./routes/country";
import jarvisRoutes from "./jarvis/routes";
import { SaleModel } from "./jarvis/models";
import { alertar } from "./jarvis/alerts";
import { iniciarAgendador } from "./jarvis/scheduler";
import { iniciarBotTelegram } from "./jarvis/telegram-bot";
import { normalizarTelefone } from "./jarvis/integrations/whatsapp";
import { classificarTransacao, registrarPagamento, registrarPixExpirado, registrarPixPendente } from "./jarvis/recovery";
import { caktoAutentico, ehCakto, normalizarWebhook, resumoParaLog, VendaNormalizada } from "./jarvis/webhook-vendas";

const app = express();
const port = process.env.PORT || 3333;

// Guarda o corpo bruto para validar a assinatura do webhook do WhatsApp.
app.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));
app.use(express.raw({ type: "application/vnd.custom-type" }));
app.use(express.text({ type: "text/html" }));

function sha256(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function onlyDigits(value: string) {
  return (value || "").replace(/\D/g, "");
}

app.get("/", async (req, res) => {
  res.json({ message: "Please visit /countries to view all the countries" });
});

app.use("/countries", countryRoutes);
app.use("/jarvis", jarvisRoutes);

// Webhook de vendas: Cakto (formato oficial) e Ticto/outras (formato achatado).
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    if (ehCakto(body) && !caktoAutentico((req as any).rawBody, req.headers, body)) {
      console.warn("⚠️ Webhook com assinatura inválida recusado.");
      return res.status(401).json({ ok: false, error: "invalid_signature" });
    }

    const resultados = [];
    for (const venda of normalizarWebhook(body)) resultados.push(await processarVenda(venda));
    const falhouMeta = resultados.some((r: any) => r.meta_error);
    return res.status(falhouMeta ? 500 : 200).json({ ok: !falhouMeta, resultados });
  } catch (error: any) {
    console.error("❌ ERRO WEBHOOK:", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "unknown_error",
    });
  }
});

async function processarVenda(v: VendaNormalizada) {
  console.log("🔥 WEBHOOK RECEBIDO:", JSON.stringify(resumoParaLog(v)));

  // As plataformas reenviam o mesmo evento quando a resposta demora: processa uma vez só.
  if (v.pedidoId && (await SaleModel.exists({ pedidoId: v.pedidoId }).catch(() => null))) {
    return { ok: true, duplicado: true, evento: v.evento };
  }

  const tipo = classificarTransacao(v.status.toLowerCase(), v.metodo);
  const aprovada = tipo === "aprovada";
  const telefone = normalizarTelefone(v.cliente.telefone) || undefined;
  const email = v.cliente.email ? String(v.cliente.email).toLowerCase().trim() : undefined;

  // Registra a transação para o JARVIS e cuida da recuperação de PIX.
  // Falha aqui não pode derrubar o envio para a Meta.
  try {
    await SaleModel.create({
      status: v.status,
      aprovada,
      valor: v.valorReais,
      metodo: v.metodo,
      produto: v.produto,
      clienteEmail: email,
      clienteNome: v.cliente.nome,
      clienteTelefone: telefone,
      plataforma: v.plataforma,
      evento: v.evento,
      pedidoId: v.pedidoId,
      raw: v.raw,
    });
    const cliente = { email, telefone, valor: v.valorReais };
    if (aprovada) await registrarPagamento(cliente);
    if (tipo === "pix_pendente") {
      await registrarPixPendente({ ...cliente, nome: v.cliente.nome, produto: v.produto, pixCodigo: v.pixCodigo, pixLink: v.pixLink });
    }
    if (v.evento === "pix_expirado") await registrarPixExpirado(cliente);
  } catch (err) {
    console.error("❌ JARVIS não conseguiu registrar a venda:", err);
  }

  if (!aprovada) {
    return { ok: true, skipped: true, reason: "status_not_purchase", status: v.status, payment_method: v.metodo };
  }

  // Evento de compra para a Meta (API de Conversões).
  const nome = String(v.cliente.nome || "").trim();
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: v.pedidoId ? v.pedidoId.split(":")[0] : undefined, // evita compra contada duas vezes
        action_source: "website",
        user_data: {
          em: email ? [sha256(email)] : undefined,
          ph: telefone ? [sha256(onlyDigits(telefone))] : undefined,
          fn: nome ? [sha256(nome.split(" ")[0])] : undefined,
          ln: nome.includes(" ") ? [sha256(nome.split(" ").slice(1).join(" "))] : undefined,
          ct: v.cliente.cidade ? [sha256(v.cliente.cidade)] : undefined,
          st: v.cliente.estado ? [sha256(v.cliente.estado)] : undefined,
          country: [sha256("br")],
        },
        custom_data: {
          currency: "BRL",
          value: v.valorReais,
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/v25.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;
  const metaResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const metaJson = await metaResp.json();
  console.log("📤 RESPOSTA META:", JSON.stringify(metaJson));

  if (!metaResp.ok) {
    await alertar({
      chave: "meta-capi-erro",
      nivel: "critico",
      area: "rastreamento",
      titulo: "Evento de compra NÃO chegou na Meta (CAPI)",
      detalhe: JSON.stringify(metaJson).slice(0, 500),
    }).catch(() => undefined);
    return { ok: false, meta_error: metaJson };
  }
  return { ok: true, sent_to_meta: true, meta: metaJson };
}

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
  iniciarAgendador()
    .then(() => (process.env.ANTHROPIC_API_KEY ? iniciarBotTelegram() : undefined))
    .catch((err) => console.error("❌ Falha ao iniciar o JARVIS:", err));
});
