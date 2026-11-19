import { config } from "../config";

// Telegram é o "controle remoto" do JARVIS: funciona no celular, tablet, PC ou navegador,
// sem precisar deixar o seu computador ligado (o JARVIS roda no servidor).
// Crie o bot com o @BotFather e pegue seu chat_id com o @userinfobot.

export type Botao = { texto: string; dados: string };

export function telegramConfigurado() {
  return Boolean(config.telegram.botToken && config.telegram.chatId);
}

export async function telegram(metodo: string, corpo: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${process.env.TELEGRAM_API_BASE || "https://api.telegram.org"}/bot${config.telegram.botToken}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.ok) throw new Error(`Telegram ${metodo} ${resp.status}: ${JSON.stringify(json)}`);
  return json.result;
}

// Envia texto (quebrado em partes de até 4000 caracteres) com botões opcionais na última parte.
export async function enviarMensagem(chatId: string | number, texto: string, botoes?: Botao[][]) {
  const partes = texto.match(/[\s\S]{1,4000}/g) || [texto || "…"];
  for (let i = 0; i < partes.length; i++) {
    const ultima = i === partes.length - 1;
    await telegram("sendMessage", {
      chat_id: chatId,
      text: partes[i],
      ...(ultima && botoes
        ? { reply_markup: { inline_keyboard: botoes.map((l) => l.map((b) => ({ text: b.texto, callback_data: b.dados }))) } }
        : {}),
    });
  }
}

export async function notificarDono(texto: string, botoes?: Botao[][]): Promise<boolean> {
  if (!telegramConfigurado()) {
    console.log("📣 [JARVIS → dono] (Telegram não configurado)\n" + texto);
    return false;
  }
  try {
    await enviarMensagem(config.telegram.chatId, texto, botoes);
    return true;
  } catch (err) {
    console.error("❌ Falha ao notificar no Telegram:", err);
    return false;
  }
}
