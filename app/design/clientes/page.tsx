import NavRail from "@/components/NavRail";
import FichaContato from "@/components/FichaContato";
import ListaClientes from "@/components/ListaClientes";
import { Card } from "@/components/ui/card";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { agoraMs } from "@/lib/periodo";
import { PAGINA_CLIENTES, fonteClientesDaMemoria, paramsClientes } from "@/lib/clientes-fonte";
import { diasSemContato, montarClientes, type ContatoClienteRow, type ConversaClienteRow, type TagClienteRow } from "@/lib/clientes";

// Preview da tela de CLIENTES (dev-only, liberado pelo proxy). Sem banco.
// `?cenario=historico|nova|vazia` troca a conta; `?sel={id}` abre uma ficha
// (sem `sel`, a coluna da ficha mostra o vazio "Escolha um cliente").
export const dynamic = "force-dynamic";

const D = 86_400_000;

export default async function DesignClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string; sel?: string }>;
}) {
  const { cenario = "historico", sel } = await searchParams;
  const agora = agoraMs();
  const iso = (ms: number) => new Date(agora - ms).toISOString();

  const c = (
    id: number,
    telefone: string,
    nome: string | null,
    extra: Partial<ContatoClienteRow> = {}
  ): ContatoClienteRow => ({
    id,
    telefone,
    nomewpp: null,
    display_name: nome,
    atendimento_ia: "ativa",
    custom_fields: {},
    email: null,
    birth_date: null,
    created_at: iso(90 * D),
    ...extra,
  });

  const todos: ContatoClienteRow[] = [
    c(1, "5535984774753", "Franck Antonny", { custom_fields: { Origem: "QR Code", Interesse: "Plano anual" } }),
    c(2, "5511981234402", "Marina Souza", { email: "marina.souza@gmail.com", birth_date: "1988-03-14", custom_fields: { Empresa: "Souza Advocacia" }, foto_path: "preview/fotos/2-abc123.jpg" }),
    c(3, "553384266039", null, { atendimento_ia: "pause" }),
    c(4, "5531998127731", "João Pereira", { custom_fields: { Origem: "Instagram" } }),
    c(5, "5541993341200", "Pedro Albuquerque", { email: "pedro@albuquerque.com.br" }),
    c(6, "5519988773321", "Helena Castro", { email: "helena@castro.com.br", birth_date: "1975-11-02" }),
    c(7, "5535991013382", null, { nomewpp: "Loja do Zé" }),
    c(8, "5562981402276", "Rafael Nogueira"),
    c(9, "5585997210034", "Juliana Farias", { birth_date: "1992-07-23", email: "ju.farias@hotmail.com" }),
    c(10, "5535984021177", "Antônio Silva"),
    c(11, "5511973026650", "Fernanda Dias"),
    c(12, "5521960147788", null),
    c(13, "5521977452010", "Beatriz Lima", { custom_fields: { Interesse: "Plano anual" } }),
    c(14, "5547991875502", "Lucas Tavares"),
    c(15, "553532210090", null, { nomewpp: "Ótica Central" }),
    c(16, "5511966200187", "Carlos Mendes", { email: "carlos.mendes@outlook.com" }),
    // Nunca escreveu (cadastrado à mão, fatia B). NÃO é frio, é outro estado.
    c(17, "5511955118890", "Ana Clara Ribeiro", { email: "anaclara.r@gmail.com" }),
  ];
  const ultimos = [0.005, 2, 0.01, 3, 5, 8, 10, 1, 25, 40, 70, 75, 100, 120, 135, 150];
  const conversas: ConversaClienteRow[] = todos.filter((t) => t.id !== 17).map((t, i) => ({
    id: 100 + t.id,
    phone: t.telefone,
    last_message_at: iso(ultimos[i] * D),
    assigned_user_id: t.id === 3 ? "u1" : null,
  }));
  const tags: TagClienteRow[] = [
    { conversation_id: 101, tags: { name: "Plano anual", color: "purple" } },
    { conversation_id: 102, tags: { name: "Fechado", color: "green" } },
    { conversation_id: 102, tags: { name: "Indicação", color: "blue" } },
    { conversation_id: 104, tags: { name: "Qualificado", color: "purple" } },
    { conversation_id: 105, tags: { name: "Orçamento", color: "amber" } },
    { conversation_id: 106, tags: { name: "Fechado", color: "green" } },
  ];

  const contatos = cenario === "vazia" ? [] : cenario === "nova" ? todos.filter((t) => [1, 3, 8].includes(t.id)) : todos;
  const itens = montarClientes(contatos, conversas, tags, null);
  // A lista paginada (01/10/2026) roda aqui sobre a memória, com as mesmas
  // funções de busca e filtro que o banco espelha.
  const fontePreview = fonteClientesDaMemoria(itens, agora);
  const paramsPreview = paramsClientes("todos", "", [], agora);
  const [paginaPreview, contagensPreview] = await Promise.all([
    fontePreview.pagina(paramsPreview, null),
    fontePreview.contagens(paramsPreview),
  ]);
  const aberto = contatos.find((t) => t.id === Number(sel)) ?? null;
  const base = `/design/clientes?cenario=${cenario}&sel={id}`;

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="O Bom Sobrinho" activeHref="/clientes" role="dono" />
      <div className="flex min-h-0 min-w-0 flex-1 md:gap-3">
        <ListaClientes
          inicial={{
            itens: paginaPreview,
            contagens: contagensPreview,
            temMais: paginaPreview.length === PAGINA_CLIENTES,
          }}
          previewTodos={itens}
          selecionadoId={aberto?.id ?? null}
          hrefModelo={base}
          simular
        />
        <Card
          variant="pagina"
          className={
            "flex w-[400px] shrink-0 flex-col overflow-hidden max-md:w-full max-md:flex-1 " +
            (aberto ? "" : "max-md:hidden")
          }
        >
          {aberto ? (
            <AreaRolavel className="min-h-0 flex-1">
              <FichaContato
                key={aberto.id}
                superficie="clientes"
                name={aberto.display_name ?? aberto.nomewpp}
                phone={aberto.telefone}
                firstMessageAt={aberto.id === 17 ? null : iso(60 * D)}
                messageCount={aberto.id === 17 ? 0 : aberto.id * 3 + 2}
                members={[]}
                myUserId=""
                conversationId={aberto.id === 17 ? null : 100 + aberto.id}
                diasSemContato={
                  aberto.id === 17 ? null : diasSemContato(iso(ultimos[aberto.id - 1] * D), agora)
                }
                clientId=""
                editableName={aberto.display_name}
                customFields={aberto.custom_fields}
                email={aberto.email}
                birthDate={aberto.birth_date}
                entendimento={aberto.id === 1 ? "Quer o plano anual e prefere ser atendido na sexta à tarde." : null}
                simular
                fotoPath={aberto.foto_path ?? null}
                contactExists
              />
            </AreaRolavel>
          ) : (
            <div data-clientes-vazio className="flex flex-1 items-center justify-center p-6 text-center text-apoio text-ink-2">
              Escolha um cliente na lista para ver e completar o cadastro.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
