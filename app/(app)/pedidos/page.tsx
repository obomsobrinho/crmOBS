import GuardaDaTela from "@/components/GuardaDaTela";
import TelaDePedidos from "@/features/pedidos/components/TelaDePedidos";

export const dynamic = "force-dynamic";

// PEDIDOS DE AJUDA (29/09/2026, refeita em 30/09/2026: docs/plano-fechar-p0.md;
// paginada em 02/10/2026, docs/plano-carregamento.md; área migrada no passo 3a de
// docs/plano-dados-e-estado.md, 14/11/2026).
// É para onde o "Abrir" do aviso no WhatsApp leva, com `?abrir={id}` para o
// pedido nascer selecionado. Abertos e resolvidos dos últimos 30 dias (D5).
//
// A página NÃO lê o banco (D8): a sessão vem do layout, a guarda decide no
// navegador e cada bloco lê pelo cache (`features/pedidos/hooks/usePedidos.ts`). A
// trava dos dados é o RLS; a das escritas, as rotas de orientar e resolver
// (`sessaoDaRota({ ativa: true })`).
//
// ⚠️ Sem `ativa` na guarda, de propósito (decisão do dono): conta bloqueada vê a
// fila como vê o `/inbox`, só não age. As rotas respondem 402 nesse caso.
export default function PedidosPage() {
  return (
    <GuardaDaTela>
      <TelaDePedidos />
    </GuardaDaTela>
  );
}
