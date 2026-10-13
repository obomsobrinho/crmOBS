import NavRail from "@/components/NavRail";
import Pedidos from "@/components/Pedidos";
import { agoraMs } from "@/lib/periodo";
import { PAGINA_PEDIDOS, ehAberto } from "@/lib/pedidos";
import type { ContatoLinha, PedidoLinha, PedidoResolvidoLinha } from "@/lib/pedidos";
import { fonteDaMemoria } from "@/lib/pedidos-fonte";
import type { LinhaHistoria } from "@/lib/historia-do-pedido";

// Preview da página de PEDIDOS (abertos e resolvidos) (dev-only, liberado pelo proxy). Sem
// banco: três pedidos em duas conversas, um deles acima de 2h (âmbar), três
// resolvidos (um de cada solução, lib/solucoes.ts) e as mensagens falsas de cada
// conversa, para a história do pedido (lib/historia-do-pedido.ts). As ações só
// simulam. `?vazio=1` mostra a página sem pedido; `?abrir=` abre a
// linha como o link do aviso faz.
export const dynamic = "force-dynamic";

const H = 3_600_000;

export default async function DesignPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ vazio?: string; abrir?: string; muitos?: string; papel?: string; regra?: string }>;
}) {
  const { vazio, abrir, muitos, papel, regra } = await searchParams;
  const agora = agoraMs();
  const iso = (msAtras: number) => new Date(agora - msAtras).toISOString();

  const pedidos: PedidoLinha[] =
    vazio === "1"
      ? []
      : [
          // Fora de ordem de propósito: quem ordena é a página.
          { id: 3, phone: "5511955554444", opened_at: iso(12 * 60_000), summary: "Quer saber se dá para parcelar em 10 vezes", motivo: "falta_info" },
          // O 1 foi ATUALIZADO pelo cliente ("preciso até sexta"): o resumo já tem o prazo.
          { id: 1, phone: "5511912345678", opened_at: iso(6 * H), summary: "Pediu o valor da troca da lente com antirreflexo e precisa até sexta", motivo: "preco", atualizado_em: iso(5 * H - 30_000) },
          { id: 2, phone: "5511912345678", opened_at: iso(40 * 60_000), summary: "Perguntou se a loja abre no feriado" },
        ];
  const contatos: ContatoLinha[] = [
    { telefone: "5511912345678", nomewpp: "Ana Paula", display_name: null },
    { telefone: "5511955554444", nomewpp: null, display_name: null },
  ];
  const resolvidos: PedidoResolvidoLinha[] =
    vazio === "1"
      ? []
      : [
          {
            id: 7, phone: "5511944443333", opened_at: iso(28 * H), summary: "Quis saber se entregam no sábado",
            instruction: "Diga que sim, até as 13h, com frete grátis acima de R$ 200.",
            closed_at: iso(27 * H), solucao: "orientou_ia", closed_by: "u1",
          },
          {
            id: 8, phone: "5511933332222", opened_at: iso(10 * H), summary: "Reclamou que a lente chegou riscada e quer trocar", motivo: "reclamacao",
            instruction: null, closed_at: iso(9.5 * H), solucao: "time_assumiu", closed_by: "u1",
          },
          {
            id: 6, phone: "5511912345678", opened_at: iso(50 * H), summary: "Pediu para falar com uma pessoa sobre a garantia", motivo: "pessoa",
            instruction: null, closed_at: iso(48 * H), solucao: "time_resolveu", closed_by: "u1",
          },
        ];
  contatos.push({ telefone: "5511944443333", nomewpp: "Carlos Mendes", display_name: null });
  contatos.push({ telefone: "5511933332222", nomewpp: "Beatriz Lima", display_name: null });

  // As mensagens REAIS de cada conversa (o que a história do pedido mostra).
  // `id` cresce com o tempo, como no banco.
  let seq = 1;
  const msg = (
    msAtras: number,
    o: Partial<Pick<LinhaHistoria, "user_message" | "bot_message" | "message_type" | "media_type" | "media_url">>
  ): LinhaHistoria => ({
    id: seq++,
    user_message: null,
    bot_message: null,
    message_type: null,
    media_type: null,
    media_url: null,
    created_at: iso(msAtras),
    ...o,
  });
  const MIN = 60_000;
  const mensagens: Record<string, LinhaHistoria[]> = {
    "5511912345678": [
      msg(50 * H + 3 * MIN, { user_message: "Bom dia! Comprei uma armação com vocês mês passado" }),
      msg(50 * H + 1 * MIN, { user_message: "Quero falar com alguém sobre a garantia, a haste soltou" }),
      msg(50 * H, { bot_message: "Vou verificar com o time e já te retorno." }),
      msg(6 * H + 4 * MIN, { user_message: "Oi, boa tarde" }),
      msg(6 * H + 3 * MIN, { user_message: "Quanto fica a troca da lente com antirreflexo?" }),
      msg(6 * H + 2 * MIN, {
        user_message: "E queria saber se a lente nova tem garantia também",
        message_type: "audio",
        media_type: "audio",
        media_url: "design/audio.ogg",
      }),
      msg(6 * H - 30_000, { bot_message: "Vou confirmar o valor com o time e já te retorno. | Enquanto isso, me diz o grau da sua receita?" }),
      // Enquanto o pedido esperava: o cliente acrescentou o prazo.
      msg(5 * H, { user_message: "Preciso até sexta, tá?" }),
      msg(5 * H - 40_000, { bot_message: "Anotado, já passei o prazo para o time." }),
      msg(41 * MIN, { user_message: "A loja abre no feriado de segunda?" }),
      msg(40 * MIN + 30_000, { media_type: "image", media_url: "design/foto.jpg", message_type: "image" }),
      msg(40 * MIN - 20_000, { bot_message: "Vou confirmar o horário do feriado com o time." }),
      // O time respondeu pela conversa SEM fechar os pedidos: "Resposta do time" nos
      // abertos. A frase da IA ao abrir não é resposta (aberto não tem "Resposta da IA").
      msg(30 * MIN, { bot_message: "Oi Ana, aqui é o Franck: no feriado abrimos das 9h às 13h.", message_type: "manual" }),
    ],
    "5511955554444": [
      // Sem mensagem do cliente antes do pedido (como a conversa de teste do e2e):
      // a seção diz que não achou, em vez de inventar.
      msg(12 * MIN - 20_000, { bot_message: "Vou confirmar as condições com o time e já te digo." }),
    ],
    "5511944443333": [
      msg(28 * H + 2 * MIN, { user_message: "Vocês entregam no sábado?" }),
      msg(28 * H - 20_000, { bot_message: "Vou confirmar com o time e te aviso." }),
      msg(27 * H - 10_000, { bot_message: "Entregamos sim, aos sábados até as 13h. | E o frete é grátis nas compras acima de R$ 200." }),
      msg(26 * H, { user_message: "Perfeito, obrigado!" }),
    ],
    "5511933332222": [
      msg(10 * H + 2 * MIN, { user_message: "Minha lente chegou riscada" }),
      msg(10 * H + 1 * MIN, { user_message: "Quero trocar, não dá para usar assim" }),
      msg(10 * H - 20_000, { bot_message: "Sinto muito! Vou passar para o time resolver com você." }),
      msg(9.5 * H + 20_000, { bot_message: "Oi Beatriz, aqui é o Franck. Pode trazer na loja que trocamos na hora.", message_type: "manual" }),
    ],
  };
  // `?muitos=1`: 22 pedidos a mais (25 abertos), para provar as páginas de 10.
  if (muitos === "1") {
    for (let i = 1; i <= 22; i++) {
      pedidos.push({
        id: 100 + i,
        phone: `55119000000${String(i).padStart(2, "0")}`,
        opened_at: iso((30 - i) * 1000),
        summary: `Pedido extra ${i}`,
      });
    }
  }

  // A mesma fonte do navegador, sobre as linhas falsas (só a primeira página).
  // `?regra=1`: a orientação do pedido 7 já virou regra (mostra "Salva como regra").
  const regrasSalvas: Record<number, string> = regra === "1" ? { 7: iso(26 * H) } : {};
  const fonte = fonteDaMemoria(pedidos, resolvidos, contatos, null, mensagens, regrasSalvas);
  const idDoLink = Number(abrir);
  const pedidoDoLink = Number.isInteger(idDoLink) && idDoLink > 0 ? await fonte.porId([], idDoLink) : null;
  const aba = pedidoDoLink && !ehAberto(pedidoDoLink) ? "resolvidos" : "abertos";
  const itens = await fonte.pagina({ aba, busca: "", fora: [] }, null, PAGINA_PEDIDOS);

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="Ótica Vision" activeHref="/pedidos" role="dono" />
      <Pedidos
        key={`${vazio}-${abrir}-${muitos}-${papel}-${regra}`}
        inicial={{
          aba,
          itens,
          temMais: itens.length === PAGINA_PEDIDOS,
          contagens: await fonte.contagens([]),
          abrir: pedidoDoLink,
        }}
        previewDados={{ abertos: pedidos, resolvidos, contatos, mensagens, regrasSalvas }}
        members={[{ userId: "u1", email: "franck@exemplo.com", role: "dono" }]}
        numeroAvisos={null}
        // `?papel=atendente` prova que o atendente não vê "Salvar como regra".
        dono={papel !== "atendente"}
        preview
      />
    </div>
  );
}
