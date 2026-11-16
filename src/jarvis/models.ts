import { model, Schema } from "mongoose";

// Venda recebida pelo webhook da plataforma (Ticto, Cakto, Kiwify...).
const SaleSchema = new Schema(
  {
    status: String,
    aprovada: Boolean,
    valor: Number,
    metodo: String,
    produto: String,
    clienteEmail: String,
    clienteNome: String,
    raw: Schema.Types.Mixed,
  },
  { timestamps: true }
);
export const SaleModel = model("JarvisSale", SaleSchema);

// Mensagem/dúvida/problema de cliente (e-mail encaminhado, chat, plataforma).
const TicketSchema = new Schema(
  {
    canal: { type: String, default: "email" },
    clienteEmail: String,
    clienteNome: String,
    assunto: String,
    mensagem: String,
    status: { type: String, enum: ["aberto", "respondido", "aguardando_aprovacao", "fechado"], default: "aberto" },
    resposta: String,
    categoria: String,
  },
  { timestamps: true }
);
export const TicketModel = model("JarvisTicket", TicketSchema);

// Alertas: tudo que o dono precisa saber.
const AlertSchema = new Schema(
  {
    chave: { type: String, index: true }, // evita alertar o mesmo problema repetidamente
    nivel: { type: String, enum: ["info", "atencao", "critico"], default: "atencao" },
    area: String,
    titulo: String,
    detalhe: String,
    resolvido: { type: Boolean, default: false },
    notificado: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export const AlertModel = model("JarvisAlert", AlertSchema);

// Diário de decisões: o que foi decidido, por quê, e o que se espera que aconteça.
const DecisionSchema = new Schema(
  {
    agente: String,
    decisao: String,
    motivo: String,
    impactoEsperado: String,
    executada: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export const DecisionModel = model("JarvisDecision", DecisionSchema);

// Ações que passam do limite de autonomia e esperam o "sim" do dono.
const ApprovalSchema = new Schema(
  {
    tipo: String, // ex.: ajustar_orcamento, enviar_email, reembolso
    descricao: String,
    payload: Schema.Types.Mixed,
    status: { type: String, enum: ["pendente", "aprovada", "rejeitada", "executada", "falhou"], default: "pendente" },
    resultado: String,
  },
  { timestamps: true }
);
export const ApprovalModel = model("JarvisApproval", ApprovalSchema);

// Ofertas mineradas.
const OfferSchema = new Schema(
  {
    nicho: String,
    nome: String,
    promessa: String,
    evidencias: String, // anúncios ativos, tempo rodando, criativos, etc.
    links: [String],
    nota: Number, // 0-10
    proximoPasso: String,
  },
  { timestamps: true }
);
export const OfferModel = model("JarvisOffer", OfferSchema);

// Memória do dono: como ele pensa, o que aprovou/rejeitou, preferências.
const OwnerMemorySchema = new Schema(
  {
    aprendizado: String,
    origem: String,
  },
  { timestamps: true }
);
export const OwnerMemoryModel = model("JarvisOwnerMemory", OwnerMemorySchema);

const ReportSchema = new Schema(
  {
    tipo: { type: String, default: "diario" },
    conteudo: String,
  },
  { timestamps: true }
);
export const ReportModel = model("JarvisReport", ReportSchema);
