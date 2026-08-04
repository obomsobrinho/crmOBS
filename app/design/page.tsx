import NavRail from "@/components/NavRail";
import ContactSidebar from "@/components/ContactSidebar";
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

const LIST: InboxItem[] = [
  { phone: "553584774753@s.whatsapp.net", name: "Franck Antonny", lastPreview: "Não consegui entender direito…", lastFrom: "out", lastMessageAt: T(11, 55), unread: 0, assignedUserId: ME },
  { phone: "553384266039@s.whatsapp.net", name: null, lastPreview: "Blz", lastFrom: "in", lastMessageAt: T(11, 58), unread: 2, assignedUserId: null },
  { phone: "553391589932@s.whatsapp.net", name: null, lastPreview: "ou usa esse sistema na sua…", lastFrom: "out", lastMessageAt: T(21, 28, 27), unread: 0, assignedUserId: "u2" },
  { phone: "553384339086@s.whatsapp.net", name: null, lastPreview: "Olá, vim pelo qr code!", lastFrom: "in", lastMessageAt: T(17, 18, 27), unread: 1, assignedUserId: null },
  { phone: "553384486180@s.whatsapp.net", name: null, lastPreview: "Por exemplo: advocacia, sa…", lastFrom: "out", lastMessageAt: T(9, 20, 27), unread: 0, assignedUserId: null },
];

export default function DesignPreview() {
  const items = LIST;
  const initialIa: Record<string, string | null> = {
    "553384266039@s.whatsapp.net": "pause",
  };

  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="OBM" activeHref="/inbox" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="panel flex min-h-0 flex-1 overflow-hidden rounded-2xl">
          <ContactSidebar
            initial={items}
            initialIa={initialIa}
            activePhone="553584774753@s.whatsapp.net"
          />
          <main className="flex min-w-0 flex-1 overflow-hidden">
            <ConversationView
              phone="553584774753@s.whatsapp.net"
              name="Franck Antonny"
              atendimentoIa="ativa"
              initialRows={OPEN}
              firstMessageAt={T(9, 0, 20)}
              messageCount={68}
              assignedUserId={ME}
              members={MEMBERS}
              myUserId={ME}
              conversationId={1}
              clientId="00000000-0000-0000-0000-0000000000cc"
              displayName={null}
              customFields={{ Origem: "QR Code", Interesse: "Plano anual" }}
              contactExists
            />
          </main>
        </div>
      </div>
    </div>
  );
}
