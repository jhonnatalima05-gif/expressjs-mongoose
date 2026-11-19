// Voz do JARVIS (texto → fala) pela ElevenLabs, com o modelo multilíngue que fala português.
// Escolha na biblioteca de vozes da ElevenLabs uma voz masculina, calma e refinada, com sotaque
// britânico, e coloque o ID em ELEVENLABS_VOICE_ID. Não clone a voz de um ator real.
// Sem ElevenLabs configurada, a central usa a voz do próprio navegador/aparelho.

export function vozConfigurada() {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

export async function sintetizarFala(texto: string): Promise<Buffer> {
  const voz = process.env.ELEVENLABS_VOICE_ID;
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY || "", "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: texto.slice(0, 2500),
      model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return Buffer.from(await resp.arrayBuffer());
}
