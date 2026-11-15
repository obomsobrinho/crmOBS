import { after } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { atualizarFotos } from "@/lib/fotos-servidor";

// CONFERIR AS FOTOS DE PERFIL VENCIDAS (lib/fotos.ts), pedido pela tela de Contatos
// depois de abrir. Até o passo 3b de docs/plano-dados-e-estado.md o layout de Contatos
// fazia isso no servidor, mas para isso lia a sessão no banco a cada clique; a tela
// migrada não lê banco no clique (D8), então pede aqui, fora do caminho da navegação.
// Best-effort: responde na hora e confere depois (`after`); nunca vira erro de tela.
// Qualquer membro pode pedir (a conferência é por empresa e carimba quem já pegou), e
// conta bloqueada também, como o layout fazia: exceção registrada em
// .claude/rules/dados-estado-desempenho.md, à espera da confirmação do dono.
export async function POST() {
  const r = await sessaoDaRota();
  if ("erro" in r) return r.erro;
  const { id, evolution_instance } = r.mine;
  after(() => atualizarFotos(id, evolution_instance));
  return new Response(null, { status: 204 });
}
