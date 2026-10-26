import NavRail from "@/components/NavRail";
import AgentConfigForm from "@/components/AgentConfigForm";
import { Card } from "@/components/ui/card";
import { EMPTY_CONFIG, type AgentConfig } from "@/lib/agent-prompt";
import type { KnowledgeDoc } from "@/lib/crm";

// Preview de design do construtor do agente (dev-only, liberado pelo proxy).
// Renderiza o form real com um AgentConfig mock, sem banco e sem login.
export const dynamic = "force-dynamic";

const MOCK: AgentConfig = {
  ...EMPTY_CONFIG,
  companyName: "Ótica Vision",
  companyWhat:
    "é uma ótica no centro da cidade, com exame de vista gratuito e armações de várias marcas.",
  companyAddress: "Rua das Flores, 120 - Centro",
  companySite: "https://oticavision.com.br",
  hoursNote: "fechado em feriados",
  // Conta já configurada: o horário foi conferido (`hoursConfirmed`, 23/10/2026).
  hoursConfirmed: true,
  agentName: "Alê",
  agentRole: "atendente",
  tone: "amigavel",
  goals: ["duvidas", "qualificar", "agendar"],
  dontDo: ["Nunca prometer prazo de entrega", "Não dar desconto por conta própria"],
  escalateWhen: ["Quando pedirem receita médica"],
  handoffNotice: "Vou verificar isso com a equipe e já te confirmo por aqui.",
  details:
    "Fazemos exame de vista gratuito com hora marcada. Trabalhamos com as marcas Ray-Ban, Oakley e Chilli Beans. Lentes multifocais têm garantia de 1 ano. Promoção do mês: 2ª armação com 40% de desconto.",
};

// Base de conhecimento mock: 4 documentos, para o bloco compacto mostrar 3 mais
// o "Ver todos (4)". Um em processamento, porque é o estado que explica a frase
// "entra no ar quando termina de processar".
const DOCS: KnowledgeDoc[] = [
  {
    id: "d1",
    title: "tabela-de-precos.pdf",
    status: "ready",
    chunkCount: 12,
    byteSize: 184_320,
    error: null,
    createdAt: "2026-08-20T14:02:00.000Z",
  },
  {
    id: "d2",
    title: "perguntas-frequentes.docx",
    status: "ready",
    chunkCount: 8,
    byteSize: 41_984,
    error: null,
    createdAt: "2026-08-19T10:40:00.000Z",
  },
  {
    id: "d3",
    title: "contrato-padrao.pdf",
    status: "processing",
    chunkCount: 0,
    byteSize: 512_000,
    error: null,
    createdAt: "2026-08-18T09:15:00.000Z",
  },
  {
    id: "d4",
    title: "catalogo-armacoes.xlsx",
    status: "ready",
    chunkCount: 31,
    byteSize: 96_256,
    error: null,
    createdAt: "2026-08-15T16:28:00.000Z",
  },
];

// Regras salvas pelo time (P1 item 5): a lista que o /agente revisa e apaga.
// Só com `?regras=1`: o mock guiado está a ~100 caracteres do aviso de tamanho
// (13.600), e o teste do aviso (ajustes.design) usa a tela padrão.
const REGRAS = [
  "Frete grátis nas compras acima de R$ 200.",
  "Aos sábados, a entrega é só até as 13h.",
];

// Prompt escrito à mão para `?modo=avancado` (a lista de regras mora embaixo dele).
const PROMPT_AVANCADO = [
  "### IDENTIDADE",
  "Você é a Alê, atendente da Ótica Vision no WhatsApp.",
  "",
  "### A EMPRESA",
  "Ótica no centro da cidade, com exame de vista gratuito e armações de várias marcas.",
].join("\n");

export default async function DesignAgentePage({
  searchParams,
}: {
  // Next 16: os parâmetros de busca chegam como Promise.
  searchParams: Promise<{ estado?: string; modo?: string; regras?: string }>;
}) {
  // `?estado=montagem` mostra a tela para quem AINDA NÃO publicou. Esse estado
  // ficou raro depois que a montagem virou rota própria (só chega aqui quem
  // digita `/agente` antes de ativar, tipicamente para entrar no modo avançado),
  // mas é justamente por ser raro que ele precisa de preview: é o único lugar
  // onde o rodapé promete o contrário do de sempre.
  const { estado, modo, regras } = await searchParams;
  const avancado = modo === "avancado";
  const jaPublicou = estado !== "montagem";

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="Ótica Vision" activeHref="/agente" role="dono" />
      {/* overflow-y-auto como na tela real: a rolagem é do cartão, uma só. E
          `px-6 pt-6` como lá, pelo mesmo motivo: o rodapé é sticky e `bottom: 0`
          cola no fim da content box, então padding embaixo deixa conteúdo
          aparecendo por baixo da faixa. */}
      <Card
        variant="pagina"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-6 max-md:px-4 max-md:pt-2"
      >
        <AgentConfigForm
          clientId="preview"
          key={`${modo}-${regras}`}
          initialMode={avancado ? "avancado" : "guiado"}
          initialConfig={MOCK}
          initialPersona={avancado ? PROMPT_AVANCADO : null}
          initialRegrasSalvas={regras === "1" ? REGRAS : []}
          hasManualPersona={false}
          initialNotifyJid="120363000000000001@g.us"
          stageNames={{ aguardando_humano: "Aguardando atendimento" }}
          knowledgeDocs={DOCS}
          knowledgeKeyConfigured
          agentEnabled={jaPublicou}
          // Por padrão, o modo EDIÇÃO (agente já no ar), que é o estado da maior
          // parte da vida da conta. A montagem tem preview próprio em
          // /design/montagem, porque virou outra ROTA do produto.
          jaPublicou={jaPublicou}
          blockers={jaPublicou ? [] : ["configurar o agente"]}
          temInstancia
          estadoWhatsAppForcado="open"
          preview
        />
      </Card>
    </div>
  );
}
