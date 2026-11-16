// Configurações que o dono muda pelo celular e que precisam sobreviver a reinícios.

import { model, Schema } from "mongoose";
import { Autonomia, config } from "./config";

const SettingSchema = new Schema({ chave: { type: String, unique: true }, valor: Schema.Types.Mixed });
const SettingModel = model("JarvisSetting", SettingSchema);

export async function carregarConfiguracoes() {
  const autonomia = await SettingModel.findOne({ chave: "autonomia" }).lean();
  if (autonomia?.valor === "total" || autonomia?.valor === "supervisionada") {
    config.autonomia = autonomia.valor;
  }
  const pausa = await SettingModel.findOne({ chave: "pausado" }).lean();
  if (typeof pausa?.valor === "boolean") config.pausado = pausa.valor;
}

export async function definirPausa(valor: boolean) {
  config.pausado = valor;
  await SettingModel.updateOne({ chave: "pausado" }, { valor }, { upsert: true });
}

export async function definirAutonomia(valor: Autonomia) {
  config.autonomia = valor;
  await SettingModel.updateOne({ chave: "autonomia" }, { valor }, { upsert: true });
}
