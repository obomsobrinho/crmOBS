import NavRail from "@/components/NavRail";
import PipelineBoard from "@/components/PipelineBoard";
import type { Member } from "@/lib/team";
import type { PipelineCard, Stage } from "@/lib/pipeline";

// Preview de design do Pipeline (dev-only, liberado pelo proxy). Sem banco e sem
// login: estágios e cards mock; arrastar e gerenciar simulam em memória.
export const dynamic = "force-dynamic";

// ⚠️ Datas RELATIVAS a hoje, e não fixas em julho de 2026. O card passou a
// mostrar IDADE em vez da hora do relógio (desenho de 18/09/2026), e com data
// fixa o preview inteiro dizia "52 dias" em todo card, o que esconde justamente
// o que o desenho quer provar: card de hoje, card de dias atrás, e a coluna
// dizendo há quanto tempo está parado o mais velho.
const T = (h: number, m: number, diasAtras = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const ME = "00000000-0000-0000-0000-000000000001";
const MEMBERS: Member[] = [
  { userId: ME, email: "ana.dona@oticavision.com", role: "dono" },
  { userId: "u2", email: "carlos.silva@oticavision.com", role: "atendente" },
];

const STAGES: Stage[] = [
  { id: 1, key: "novo", name: "Novo", position: 0, isCanonical: true, isDefault: true, archived: false, color: "blue" },
  { id: 2, key: "qualificado", name: "Qualificado", position: 1, isCanonical: true, isDefault: false, archived: false, color: "violet" },
  { id: 3, key: "aguardando_humano", name: "Aguardando atendimento", position: 2, isCanonical: true, isDefault: false, archived: false, color: "amber" },
  { id: 4, key: "fechado", name: "Fechado", position: 3, isCanonical: false, isDefault: false, archived: false, color: "green" },
];

function card(p: Partial<PipelineCard> & { phone: string }): PipelineCard {
  return {
    name: null,
    lastPreview: "",
    lastFrom: "in",
    lastMessageAt: T(11, 0),
    unread: 0,
    assignedUserId: null,
    stage: null,
    summary: null,
    paused: false,
    handoffAt: null,
    stageSource: null,
    ...p,
  };
}

const CARDS: PipelineCard[] = [
  card({ phone: "553584774753@s.whatsapp.net", name: "Franck Antonny", lastPreview: "Olá, vim pelo QR code!", lastFrom: "in", unread: 2, stage: "novo", lastMessageAt: T(11, 48) }),
  card({ phone: "553384266039@s.whatsapp.net", name: "Marina Souza", lastPreview: "Qual o valor do plano anual?", lastFrom: "in", stage: "novo", lastMessageAt: T(10, 12, 1) }),
  card({ phone: "553391589932@s.whatsapp.net", name: "João Pereira", lastFrom: "out", stage: "qualificado", assignedUserId: "u2", lastPreview: "Perfeito, vou verificar", lastMessageAt: T(21, 28, 3), stageSource: "human" }),
  card({ phone: "553384339086@s.whatsapp.net", name: "Loja do Zé", stage: "aguardando_humano", paused: true, assignedUserId: ME, summary: "Cliente quer marcar uma conversa, prefere terça à tarde.", lastMessageAt: T(17, 18, 1), handoffAt: T(9, 5, 1), stageSource: "ia" }),
  // Handoff aberto HÁ DIAS: é o card que o desenho mostra como "12 dias" e o que
  // faz a coluna dizer "mais antigo há N". Sem ele o preview não exercita nem o
  // âmbar de "Sua vez" nem o subtítulo da coluna.
  card({ phone: "553398620145@s.whatsapp.net", name: "Rafael Tobias", stage: "qualificado", summary: "Pediu orçamento da armação infantil e não voltou.", lastMessageAt: T(15, 40, 12), handoffAt: T(15, 40, 12), stageSource: "ia" }),
  // Fechado, com resumo, pausada e SEM responsável: é o caso que o dono do
  // produto reportou (card movido para Fechado que continuava com ponto e resumo
  // em âmbar, parecendo pendência). Aqui ele prova as duas correções de uma vez:
  // o resumo sai do âmbar, e o ponto passa a dizer "ninguém atende", que é o que
  // de fato acontece com a IA pausada e nenhum responsável.
  card({ phone: "553384486180@s.whatsapp.net", name: "Beatriz Lima", stage: "fechado", lastFrom: "out", lastPreview: "Obrigada!", paused: true, summary: "Cliente perguntou o valor do plano anual e ficou de responder.", lastMessageAt: T(9, 20, 5) }),
];

export default function DesignPipelinePage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/pipeline" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col">
        <PipelineBoard
          clientId="cc"
          myRole="dono"
          initialStages={STAGES}
          initialCards={CARDS}
          preview
          previewMembers={MEMBERS}
        />
      </div>
    </div>
  );
}
