import NavRail from "@/components/NavRail";
import ContactSidebar from "@/components/ContactSidebar";
import { Card } from "@/components/ui/card";
import ConversationView from "@/components/ConversationView";
import type { Member } from "@/lib/team";
import type { ChatRow, InboxItem } from "@/lib/types";

// Página de PREVIEW de design (só em desenvolvimento — bloqueada em produção
// pelo proxy). Renderiza os componentes reais com dados fake, sem exigir login,
// para inspeção visual (Playwright) da UI e dos temas.
export const dynamic = "force-dynamic";

const T = (h: number, m: number, day = 28) =>
  new Date(2026, 6, day, h, m).toISOString();

function row(p: Partial<ChatRow> & { id: number }): ChatRow {
  return {
    phone: "553584774753@s.whatsapp.net",
    nomewpp: null,
    user_message: null,
    bot_message: null,
    message_type: null,
    active: null,
    created_at: T(11, 0),
    ...p,
  };
}

const OPEN: ChatRow[] = [
  row({ id: 1, nomewpp: "Franck Antonny", user_message: "Olá", created_at: T(11, 48, 27) }),
  row({ id: 2, user_message: "Novo teste", created_at: T(11, 55, 27) }),
  row({ id: 3, bot_message: "Não consegui entender direito, pode repetir? | Se preferir, me manda um áudio.", message_type: "text", created_at: T(11, 55) }),
  row({ id: 4, user_message: "vi aqui que o horário de quinta não está disponível, pode ser na sexta?", created_at: T(17, 18) }),
  row({ id: 5, bot_message: "vi aqui que o horário de quinta não está disponível, pode ser na sexta-feira?", message_type: "manual", created_at: T(17, 18) }),
  row({ id: 6, user_message: "Ok, pode ser na sexta à tarde", created_at: T(17, 19) }),
  row({ id: 7, bot_message: "excelente, combinado!", message_type: "text", created_at: T(17, 19) }),
  row({ id: 8, bot_message: "excelente, combinado!", message_type: "manual", created_at: T(17, 19) }),
];

const ME = "00000000-0000-0000-0000-000000000001";
const MEMBERS: Member[] = [
  { userId: ME, email: "ana@obm.com", role: "dono" },
  { userId: "u2", email: "carlos@obm.com", role: "atendente" },
];

// ⚠️ AS DATAS DA LISTA SÃO RELATIVAS A AGORA desde 19/09/2026, e as da CONVERSA
// continuam fixas em julho. Não é inconsistência: a lista passou a ter recorte de
// tempo (Hoje / 7 dias / Tudo, padrão Hoje), e com data fixa o preview abriria
// permanentemente vazio, que é o oposto de um preview. A conversa aberta não tem
// recorte nenhum, então as marcações de dia dela podem continuar fixas.
const AGORA = Date.now();
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/**
 * Meia-noite de HOJE em America/Sao_Paulo.
 *
 * ⚠️ Ancorar no DIA CIVIL, e não em "x horas atrás", não é preciosismo: a janela
 * da lista compara dia civil de São Paulo, então "duas horas atrás" cai em ONTEM
 * se o preview for aberto (ou o teste rodar) às 01h. O fuso é fixo em -03:00
 * desde que o Brasil acabou com o horário de verão, em 2019.
 */
const MEIA_NOITE = Date.parse(
  `${new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(AGORA))}T00:00:00-03:00`
);
/**
 * Hoje, às `h` horas de São Paulo, nunca depois de agora: o `Math.min` evita o
 * preview aberto de manhã mostrar mensagem das 21h, que ainda não aconteceu.
 */
const HOJE = (h: number) =>
  new Date(Math.min(MEIA_NOITE + h * HORA, AGORA)).toISOString();
/** `d` dias atrás, ao meio-dia de São Paulo. */
const DIAS_ATRAS = (d: number) =>
  new Date(MEIA_NOITE - d * DIA + 12 * HORA).toISOString();

// Handoff em aberto, e ele é de ONTEM de propósito: é o único jeito de o preview
// mostrar a regra que mais importa do recorte de tempo, que é "quem espera por
// você nunca some pelo filtro". Esta conversa aparece mesmo em "Hoje".
const ESPERANDO_DESDE_ONTEM = DIAS_ATRAS(1);

const LIST: InboxItem[] = [
  { phone: "553584774753@s.whatsapp.net", name: "Franck Antonny", lastPreview: "Não consegui entender direito…", lastFrom: "out", lastMessageAt: HOJE(11.9), unread: 0, assignedUserId: ME, stage: null, handoffAt: null },
  // Handoff aberto e ninguém respondeu ainda: é o caso de "Precisa de você".
  { phone: "553384266039@s.whatsapp.net", name: null, lastPreview: "Blz", lastFrom: "in", lastMessageAt: ESPERANDO_DESDE_ONTEM, unread: 2, assignedUserId: null, stage: null, handoffAt: ESPERANDO_DESDE_ONTEM },
  { phone: "553391589932@s.whatsapp.net", name: null, lastPreview: "ou usa esse sistema na sua…", lastFrom: "out", lastMessageAt: HOJE(21.5), unread: 0, assignedUserId: "u2", stage: null, handoffAt: null },
  { phone: "553384339086@s.whatsapp.net", name: null, lastPreview: "Olá, vim pelo qr code!", lastFrom: "in", lastMessageAt: HOJE(17.3), unread: 1, assignedUserId: null, stage: null, handoffAt: null },
  // Fora de "Hoje" e dentro de "7 dias": é ela que prova que o recorte recorta.
  { phone: "553384486180@s.whatsapp.net", name: null, lastPreview: "Por exemplo: advocacia, sa…", lastFrom: "out", lastMessageAt: DIAS_ATRAS(3), unread: 0, assignedUserId: null, stage: null, handoffAt: null },
  // Fora dos dois: só aparece em "Tudo".
  { phone: "553399412233@s.whatsapp.net", name: null, lastPreview: "Obrigado, era só isso mesmo", lastFrom: "in", lastMessageAt: DIAS_ATRAS(20), unread: 0, assignedUserId: null, stage: null, handoffAt: null },
];

export default function DesignPreview() {
  const items = LIST;
  // Os TRÊS estados de "quem atende" (`quemAtende`, lib/crm), porque o indicador
  // no avatar depende deles e um mock com um estado só não prova nada:
  //
  // 1. pausada COM responsável -> pessoa atendendo, mostrada pelo avatar do
  //    responsável. É a conversa atribuída à pessoa logada: você assumiu, a IA saiu.
  // 2. pausada SEM responsável -> ninguém atende, e aí sim é alerta. É o estado
  //    dos contatos que ficaram travados pelo handoff antigo.
  // 3. não pausada -> a IA atende (todas as outras).
  const initialIa: Record<string, string | null> = {
    "553584774753@s.whatsapp.net": "pause",
    "553384339086@s.whatsapp.net": "pause",
  };

  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="O Bom Sobrinho" activeHref="/inbox" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 gap-3">
          <ContactSidebar
            initial={items}
            initialIa={initialIa}
            activePhone="553584774753@s.whatsapp.net"
            myUserId={ME}
          />
          <Card asChild className="flex min-w-0 flex-1 overflow-hidden">
            <main>
            <ConversationView
              phone="553584774753@s.whatsapp.net"
              name="Franck Antonny"
              // ⚠️ "pause", e não "ativa". Esta conversa está atribuída (o mock
              // manda `assignedUserId={ME}`), e desde 19/09/2026 IA e pessoa não
              // coexistem: atribuir pausa a IA, religar a IA larga o
              // responsável. Com "ativa" o preview mostrava um estado que o
              // produto não produz mais, e ainda discordava da própria lista ao
              // lado, que já pintava este contato como "Você assumiu · IA
              // pausada" (ver `initialIa` acima).
              atendimentoIa="pause"
              initialRows={OPEN}
              firstMessageAt={T(9, 0, 20)}
              messageCount={68}
              assignedUserId={ME}
              members={MEMBERS}
              myUserId={ME}
              conversationId={1}
              pendingInstruction={null}
              clientId="00000000-0000-0000-0000-0000000000cc"
              displayName={null}
              customFields={{ Origem: "QR Code", Interesse: "Plano anual" }}
                contactExists
              />
            </main>
          </Card>
        </div>
      </div>
    </div>
  );
}
