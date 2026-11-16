import path from "path";
import { Router, Request, Response, NextFunction } from "express";
import { config } from "./config";
import { perguntarAoJarvis } from "./agents/chief";
import { NOMES_ESPECIALISTAS, NomeEspecialista, rodarEspecialista } from "./agents/specialists";
import { AlertModel, ConversationModel, ApprovalModel, DecisionModel, OfferModel, OwnerMemoryModel, ReportModel, TicketModel } from "./models";
import { decidirAprovacao } from "./tools/actions";
import { panorama } from "./tools/operation";
import { gerarRelatorioDiario, rodarMineracao } from "./scheduler";
import { oportunidades } from "./seasonality";
import { assinaturaValida, extrairMensagens } from "./integrations/whatsapp";
import { receberMensagemWhatsApp } from "./recovery";

const routes = Router();

// Páginas de vendas geradas são públicas (para usar como landing page).
routes.get("/paginas/:arquivo", (req, res) => {
  const arquivo = path.basename(req.params.arquivo);
  res.sendFile(path.resolve(config.outputDir, "paginas", arquivo), (err) => {
    if (err) res.status(404).json({ error: "Página não encontrada" });
  });
});

// Webhook do WhatsApp Cloud API (público: a Meta chama direto; protegido pela assinatura).
routes.get("/whatsapp/webhook", (req, res) => {
  const ok = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN;
  if (ok && process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(String(req.query["hub.challenge"]));
  res.sendStatus(403);
});

routes.post("/whatsapp/webhook", (req, res) => {
  if (!assinaturaValida((req as any).rawBody, req.header("x-hub-signature-256"))) return res.sendStatus(401);
  res.sendStatus(200); // responde já; a Meta reenvia se demorar
  for (const m of extrairMensagens(req.body)) {
    receberMensagemWhatsApp(m).catch((err) => console.error("❌ Mensagem do WhatsApp:", err));
  }
});

// Entrada de tickets (e-mail encaminhado, formulário, Zapier/Make, etc.).
// Protegida pelo mesmo token; configure o serviço de encaminhamento para enviá-lo.
function exigirToken(req: Request, res: Response, next: NextFunction) {
  if (!config.apiToken) {
    return res.status(503).json({ error: "Defina JARVIS_API_TOKEN para usar as rotas do JARVIS." });
  }
  if (req.header("x-jarvis-token") !== config.apiToken) {
    return res.status(401).json({ error: "Token inválido" });
  }
  next();
}

routes.use(exigirToken);

const assincrono =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: String(err?.message || err) });
    });

// Converse com o JARVIS: perguntas, ordens, "o que acontece se...?"
routes.post("/chat", assincrono(async (req, res) => {
  const mensagem = String(req.body?.mensagem || "").trim();
  if (!mensagem) return res.status(400).json({ error: "Envie { mensagem }" });
  res.json({ resposta: await perguntarAoJarvis(mensagem) });
}));

// Fala direto com um especialista (sem passar pelo chefe).
routes.post("/agentes/:nome", assincrono(async (req, res) => {
  const nome = req.params.nome as NomeEspecialista;
  if (!NOMES_ESPECIALISTAS.includes(nome)) {
    return res.status(404).json({ error: `Agentes: ${NOMES_ESPECIALISTAS.join(", ")}` });
  }
  const tarefa = String(req.body?.tarefa || "").trim();
  if (!tarefa) return res.status(400).json({ error: "Envie { tarefa }" });
  res.json({ resultado: await rodarEspecialista(nome, tarefa, req.body?.contexto) });
}));

routes.get("/panorama", assincrono(async (_req, res) => res.json(await panorama())));

routes.post("/relatorio", assincrono(async (_req, res) => res.json({ relatorio: await gerarRelatorioDiario() })));
routes.get("/relatorios", assincrono(async (_req, res) => res.json(await ReportModel.find().sort({ createdAt: -1 }).limit(30))));

routes.get("/alertas", assincrono(async (req, res) => {
  const filtro = req.query.todos ? {} : { resolvido: false };
  res.json(await AlertModel.find(filtro).sort({ createdAt: -1 }).limit(100));
}));

routes.get("/decisoes", assincrono(async (_req, res) => res.json(await DecisionModel.find().sort({ createdAt: -1 }).limit(100))));
routes.get("/ofertas", assincrono(async (_req, res) => res.json(await OfferModel.find().sort({ nota: -1, createdAt: -1 }).limit(100))));

routes.get("/aprovacoes", assincrono(async (_req, res) => res.json(await ApprovalModel.find({ status: "pendente" }).sort({ createdAt: -1 }))));

routes.post("/aprovacoes/:id/:decisao(aprovar|rejeitar)", assincrono(async (req, res) => {
  const aprovar = req.params.decisao === "aprovar";
  const resultado = await decidirAprovacao(req.params.id, aprovar);
  // O motivo do dono vira aprendizado: é assim que o JARVIS aprende a pensar como ele.
  const motivo = String(req.body?.motivo || "").trim();
  if (motivo) {
    const ap = await ApprovalModel.findById(req.params.id).lean();
    await OwnerMemoryModel.create({
      aprendizado: `${aprovar ? "Aprovou" : "Rejeitou"} "${ap?.descricao}". Motivo: ${motivo}`,
      origem: "aprovacao",
    });
  }
  res.json({ resultado });
}));

routes.post("/tickets", assincrono(async (req, res) => {
  const { clienteEmail, clienteNome, assunto, mensagem, canal } = req.body || {};
  if (!mensagem) return res.status(400).json({ error: "Envie ao menos { mensagem, clienteEmail }" });
  res.status(201).json(await TicketModel.create({ clienteEmail, clienteNome, assunto, mensagem, canal }));
}));

routes.get("/oportunidades", (_req, res) => res.json(oportunidades(new Date(), 365)));
routes.post("/minerar", assincrono(async (req, res) => res.json({ resultado: await rodarMineracao(req.body?.foco) })));

// Conversas de recuperação/vendas (?status=em_conversa etc.).
routes.get("/recuperacao", assincrono(async (req, res) => {
  const filtro = req.query.status ? { status: String(req.query.status) } : {};
  res.json(await ConversationModel.find(filtro).sort({ updatedAt: -1 }).limit(100));
}));

routes.get("/memoria", assincrono(async (_req, res) => res.json(await OwnerMemoryModel.find().sort({ createdAt: -1 }))));
routes.post("/memoria", assincrono(async (req, res) => {
  const aprendizado = String(req.body?.aprendizado || "").trim();
  if (!aprendizado) return res.status(400).json({ error: "Envie { aprendizado }" });
  res.status(201).json(await OwnerMemoryModel.create({ aprendizado, origem: "dono" }));
}));

export default routes;
