import { AlertModel } from "./models";
import { notificarDono } from "./integrations/telegram";

type NovoAlerta = {
  chave: string; // identifica o problema; o mesmo problema não é alertado de novo enquanto aberto
  nivel: "info" | "atencao" | "critico";
  area: string;
  titulo: string;
  detalhe?: string;
};

const ICONE = { info: "🔵", atencao: "🟠", critico: "🔴" } as const;

// Cria o alerta (se ainda não existir aberto) e avisa o dono na hora quando não é só "info".
// Retorna true se o alerta é novo.
export async function alertar(a: NovoAlerta): Promise<boolean> {
  const existente = await AlertModel.findOne({ chave: a.chave, resolvido: false });
  if (existente) return false;
  const alerta = await AlertModel.create(a);
  if (a.nivel !== "info") {
    const ok = await notificarDono(`${ICONE[a.nivel]} [${a.area}] ${a.titulo}\n${a.detalhe || ""}`.trim());
    alerta.notificado = ok;
    await alerta.save();
  }
  return true;
}

export async function resolverAlerta(chaveOuId: string) {
  const filtro = /^[a-f0-9]{24}$/i.test(chaveOuId) ? { _id: chaveOuId } : { chave: chaveOuId, resolvido: false };
  await AlertModel.updateMany(filtro, { resolvido: true });
}
