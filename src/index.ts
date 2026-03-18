import "./lib/db";
import express from "express";
import crypto from "crypto";
import countryRoutes from "./routes/country";

const app = express();
const port = process.env.PORT || 3333;

app.use(express.json());
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

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("🔥 WEBHOOK RECEBIDO:", JSON.stringify(body));

    // Ajuste estes caminhos conforme o payload real da Ticto
    const status = body.status || "";
    const paymentMethod = body.payment_method || "";
    const customer = body.customer || {};
    const order = body.order || {};
    const amountRaw =
      body.amount ??
      body.total ??
      order.amount ??
      order.total ??
      0;

    // Só envia Purchase quando a venda estiver realmente aprovada/realizada
    // Ajuste conforme o texto exato que a Ticto mandar no seu payload real
    const approvedStatuses = ["authorized", "approved", "paid", "completed", "finished", "realized", "venda_realizada"];
    const normalizedStatus = String(status).toLowerCase();

    if (!approvedStatuses.includes(normalizedStatus)) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "status_not_purchase",
        status,
        payment_method: paymentMethod,
      });
    }

    const email = customer.email ? sha256(String(customer.email)) : undefined;
    const phoneDigits = customer.phone ? onlyDigits(String(customer.phone)) : "";
    const phone = phoneDigits ? sha256(phoneDigits) : undefined;

    // Se a Ticto mandar centavos, ajuste aqui.
    // Ex.: 3700 -> 37.00
    const value =
      typeof amountRaw === "number"
        ? amountRaw > 999 ? amountRaw / 100 : amountRaw
        : Number(String(amountRaw).replace(",", ".")) || 0;

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
user_data: {
  em: email ? [email] : undefined,
  ph: phone ? [phone] : undefined,
  fn: customer.name ? [sha256(customer.name.split(" ")[0])] : undefined,
  ln: customer.name ? [sha256(customer.name.split(" ").slice(1).join(" "))] : undefined,
  ct: customer.address?.city ? [sha256(customer.address.city)] : undefined,
  st: customer.address?.state ? [sha256(customer.address.state)] : undefined,
 country: [sha256("br")],
},
          custom_data: {
            currency: "BRL",
            value,
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/v25.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;

    const metaResp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const metaJson = await metaResp.json();
    console.log("📤 RESPOSTA META:", JSON.stringify(metaJson));

    if (!metaResp.ok) {
      return res.status(500).json({
        ok: false,
        meta_error: metaJson,
      });
    }

    return res.status(200).json({
      ok: true,
      sent_to_meta: true,
      meta: metaJson,
    });
  } catch (error: any) {
    console.error("❌ ERRO WEBHOOK:", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "unknown_error",
    });
  }
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
