import { config } from "../config";

// Notificação para o celular do dono via bot do Telegram.
// Crie o bot com o @BotFather e pegue seu chat_id com o @userinfobot.
export async function notificarDono(texto: string): Promise<boolean> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    console.log("📣 [JARVIS → dono] (Telegram não configurado)\n" + texto);
    return false;
  }
  // Telegram limita mensagens a 4096 caracteres.
  const partes = texto.match(/[\s\S]{1,4000}/g) || [texto];
  for (const parte of partes) {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: parte }),
    });
    if (!resp.ok) {
      console.error("❌ Falha ao notificar no Telegram:", resp.status, await resp.text());
      return false;
    }
  }
  return true;
}
