import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchMembers, type Member } from "@/lib/team";

// Membros do time lidos NO SERVIDOR, com cache por tenant (R-52, 01/10/2026).
//
// Quem lê isto: as páginas que só PRECISAM do nome do atendente
// (`/inbox/[id]`, `/clientes/[id]`, `/pedidos`). A abertura de uma conversa
// relia a RPC (join com auth.users) toda vez, e o time muda quase nunca.
// Fora daqui, de propósito: `/equipe` e `/assinatura` (a conta de assentos
// cobra dinheiro, então leem do banco na hora) e os componentes de browser
// (`fetchMembers` com a sessão da pessoa).
//
// A chave é o id do tenant, que vem de `getMyClient()` (sessão), nunca de
// entrada do usuário: o cache não mistura tenants. A leitura é por service_role
// (`tenant_members_do_cliente`), porque `tenant_members()` depende de
// `auth.uid()` e não pode rodar dentro de um cache compartilhado.
//
// INVALIDAÇÃO: as duas rotas que mudam o time (`team/invite`, `team/remove`)
// chamam `invalidarMembros`. O TTL é só a rede de segurança para uma mudança
// feita por fora (SQL na mão, outro caminho que ninguém lembrou).
const TTL_SEGUNDOS = 300;

const tagMembros = (clientId: string) => `membros-${clientId}`;

export async function membrosDoTenant(
  supabase: SupabaseClient,
  clientId: string
): Promise<Member[]> {
  try {
    return await unstable_cache(
      async () => {
        const { data, error } = await createServiceClient().rpc(
          "tenant_members_do_cliente",
          { p_client: clientId }
        );
        // Lançar (e não devolver []) para o erro NÃO ser guardado no cache.
        if (error || !data) throw new Error(error?.message ?? "sem dados");
        return (data as { user_id: string; email: string; role: string }[]).map(
          (r) => ({ userId: r.user_id, email: r.email, role: r.role })
        );
      },
      ["membros", clientId],
      { tags: [tagMembros(clientId)], revalidate: TTL_SEGUNDOS }
    )();
  } catch (e) {
    // Função ainda não aplicada no banco, ou falha de rede: cai para a leitura
    // direta com a sessão da pessoa (o caminho de antes), sem cache.
    console.error("membros do tenant (cache):", e);
    return fetchMembers(supabase);
  }
}

/** Chamar depois de convidar ou remover alguém. Expira na hora (rota de escrita). */
export function invalidarMembros(clientId: string) {
  revalidateTag(tagMembros(clientId), { expire: 0 });
}
