// Traduz o webhook de cada plataforma de vendas para um formato único.
//
// Cakto (docs.cakto.com.br/conceitos/webhooks): { secret, event, data }, valores em REAIS,
//   data pode ser objeto (V1) ou lista (V2), código PIX em data.pix.qrCode.
// Ticto e outras: formato "achatado" (status, payment_method, customer, amount na raiz).

import crypto from "crypto";

export type VendaNormalizada = {
  plataforma: "cakto" | "generica";
  evento?: string; // ex.: pix_gerado, purchase_approved (Cakto)
  pedidoId?: string; // chave para não processar o mesmo evento duas vezes
  status: string;
  metodo: string;
  valorReais: number;
  produto?: string;
  cliente: { nome?: string; email?: string; telefone?: string; cidade?: string; estado?: string };
  pixCodigo?: string;
  pixLink?: string;
  raw: any;
};

export function ehCakto(body: any) {
  return typeof body?.event === "string" && body?.data !== undefined && "secret" in (body || {});
}

// Valida a origem da Cakto: assinatura HMAC no header (preferida) ou o secret do corpo.
// Sem CAKTO_WEBHOOK_SECRET configurado, aceita (e avisa no log).
export function caktoAutentico(rawBody: Buffer | undefined, headers: Record<string, any>, body: any): boolean {
  const segredo = process.env.CAKTO_WEBHOOK_SECRET;
  if (!segredo) {
    console.warn("⚠️ CAKTO_WEBHOOK_SECRET não configurado: webhook da Cakto aceito sem validar a origem.");
    return true;
  }
  const ts = String(headers["x-cakto-timestamp"] || "");
  const assinatura = String(headers["x-cakto-signature"] || "");
  if (ts && assinatura && rawBody) {
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const esperado = "v1=" + crypto.createHmac("sha256", segredo).update(`${ts}.`).update(rawBody).digest("hex");
    // O header pode trazer mais de uma versão separada por vírgula.
    return assinatura.split(",").some((s) => {
      const a = Buffer.from(s.trim());
      const b = Buffer.from(esperado);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  }
  const recebido = Buffer.from(String(body?.secret || ""));
  const certo = Buffer.from(segredo);
  return recebido.length === certo.length && crypto.timingSafeEqual(recebido, certo);
}

// Aceita 97, "97.00", "97,00" e "1.997,00".
function numero(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
}

function deCakto(body: any): VendaNormalizada[] {
  const itens = Array.isArray(body.data) ? body.data : [body.data];
  return itens.filter(Boolean).map((d: any) => {
    // checkout_abandonment tem outro formato (sem pedido).
    if (body.event === "checkout_abandonment") {
      return {
        plataforma: "cakto" as const,
        evento: body.event,
        pedidoId: `abandono:${d.customerEmail || ""}:${d.offer?.id || ""}:${d.createdAt || ""}`,
        status: "checkout_abandonment",
        metodo: "",
        valorReais: numero(d.offer?.price),
        produto: d.product?.name,
        cliente: { nome: d.customerName || undefined, email: d.customerEmail || undefined, telefone: d.customerCellphone || undefined },
        pixLink: d.checkoutUrl || undefined,
        raw: d,
      };
    }
    const c = d.customer || {};
    return {
      plataforma: "cakto" as const,
      evento: body.event,
      pedidoId: d.id ? `${d.id}:${body.event}` : undefined,
      status: String(d.status || ""),
      metodo: String(d.paymentMethod || ""),
      valorReais: numero(d.amount ?? d.baseAmount), // Cakto já manda em reais
      produto: d.product?.name || d.offer?.name,
      cliente: { nome: c.name, email: c.email, telefone: c.phone, cidade: d.address?.city, estado: d.address?.state },
      pixCodigo: typeof d.pix?.qrCode === "string" ? d.pix.qrCode : undefined,
      pixLink: d.checkoutUrl || undefined,
      raw: d,
    };
  });
}

function generica(body: any): VendaNormalizada {
  const customer = body.customer || {};
  const order = body.order || {};
  const bruto = body.amount ?? body.total ?? order.amount ?? order.total ?? 0;
  const n = numero(bruto);
  const p = body.pix || body.payment?.pix || order.pix || {};
  const codigo =
    body.pix_code || body.pix_qrcode || body.qr_code || body.pix_copy_paste ||
    p.code || p.qrcode || p.qr_code || p.qrCode || p.copy_paste || p.emv || p.payload ||
    body.payment?.pix_code || body.payment?.qrcode || order.pix_code;
  const link = body.pix_url || p.url || p.link || body.payment_url || body.payment?.url || order.payment_url;
  const id = body.transaction_id || body.order_id || order.id || order.code || body.id || body.code;
  return {
    plataforma: "generica",
    pedidoId: id ? `${id}:${body.status || ""}` : undefined,
    status: String(body.status || ""),
    metodo: String(body.payment_method || ""),
    // Algumas plataformas mandam centavos (3700 = R$37,00): mantém o comportamento que já existia.
    valorReais: n > 999 ? n / 100 : n,
    produto: body.product?.name || body.item?.product_name || order.product_name || body.offer?.name,
    cliente: {
      nome: customer.name,
      email: customer.email,
      telefone: customer.phone || customer.cellphone || customer.mobile || body.phone,
      cidade: customer.address?.city,
      estado: customer.address?.state,
    },
    pixCodigo: typeof codigo === "string" && codigo.length > 20 ? codigo : undefined,
    pixLink: typeof link === "string" && /^https?:\/\//.test(link) ? link : undefined,
    raw: body,
  };
}

export function normalizarWebhook(body: any): VendaNormalizada[] {
  return ehCakto(body) ? deCakto(body) : [generica(body || {})];
}

// Log sem dados pessoais nem o secret.
export function resumoParaLog(v: VendaNormalizada) {
  return {
    plataforma: v.plataforma,
    evento: v.evento,
    status: v.status,
    metodo: v.metodo,
    valor: v.valorReais,
    produto: v.produto,
    temPix: Boolean(v.pixCodigo),
    temTelefone: Boolean(v.cliente.telefone),
  };
}
