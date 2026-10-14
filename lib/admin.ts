import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Supa } from "@/lib/supabase/tipos";
import { ehAdminPeloAmbiente, idsDeAdmin, listaDeAdmins } from "@/lib/admin-acesso";
import { mesSP } from "@/lib/custo-ia";
import { mesmoDestino } from "@/lib/avisos";
import { PAGINA_EMPRESAS, paraEmpresa, type EmpresaItem } from "@/lib/admin-empresas";

// O LADO SERVIDOR DO /admin (P1 item 6). Três travas, como decidido em
// 29/09/2026: a lista fixa (`ADMIN_USER_IDS`), `/admin` barrado no `proxy.ts`
// para qualquer outro login e leitura SEMPRE no servidor (service_role, que
// nunca vai ao navegador). Toda escrita grava uma linha em `admin_acoes`, na
// mesma transação (funções SQL do admin).

/**
 * O id do admin logado, ou `null` (sem sessão, ou fora da lista). `revalidar`
 * reconfere a sessão no Auth (`getUser()`), para rota que ESCREVE: o padrão
 * confere o JWT só localmente (`getClaims()`), como `sessaoDaRota`.
 */
export async function adminDaSessao(opcoes: { revalidar?: boolean } = {}): Promise<string | null> {
  const supabase = await createClient();
  if (opcoes.revalidar) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return ehAdminPeloAmbiente(data.user.id) ? data.user.id : null;
  }
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  return ehAdminPeloAmbiente(userId) ? userId : null;
}

/**
 * Uma página da lista de Empresas (ordem de nome, busca no banco). `n` vai cru:
 * quem limita o tamanho (1 a 50) é o SQL.
 */
export async function paginaDeEmpresas(
  svc: Supa,
  a: {
    agora: number;
    busca: string;
    depois: { nome: string; id: string } | null;
    n?: number;
    modelo: string | null;
  }
): Promise<EmpresaItem[]> {
  const { data, error } = await svc.rpc("admin_empresas_pagina", {
    p_mes: mesSP(a.agora),
    p_busca: a.busca.trim() || null,
    p_cursor_nome: a.depois?.nome ?? null,
    p_cursor_id: a.depois?.id ?? null,
    p_limite: a.n ?? PAGINA_EMPRESAS,
  });
  if (error) throw error;
  return (data ?? []).map((l) => paraEmpresa(l, a.modelo));
}

/**
 * Para onde vão os avisos que são do DONO DO PRODUTO (decisão do dono,
 * 13/10/2026): o destino de avisos (`notify_group_jid`) do tenant de cada admin,
 * mandado pela instância desse tenant. UMA consulta (`user_clients` com
 * `clients` embutido) e a escolha em memória: o tenant mais antigo de cada
 * admin, a MESMA escolha de `getMyClient` (lib/auth.ts, `order created_at`
 * ascendente, `limit 1`), ou seja, o tenant que o login dele abre. Sem destino
 * ou sem instância, aquele admin fica de fora (e o log diz). Destinos iguais
 * (pela chave do telefone, `mesmoDestino`) saem uma vez só.
 */
export async function destinosDoDono(
  svc: Supa
): Promise<{ instancia: string; destino: string }[]> {
  const ids = idsDeAdmin(listaDeAdmins());
  if (ids.length === 0) return [];
  const { data, error } = await svc
    .from("user_clients")
    .select("user_id, clients(evolution_instance, notify_group_jid, created_at)")
    .in("user_id", ids);
  if (error) {
    console.error("aviso ao dono: falha ao ler os tenants do admin:", error.message);
    return [];
  }
  const saida: { instancia: string; destino: string }[] = [];
  for (const userId of ids) {
    const tenants = (data ?? [])
      .filter((v) => v.user_id === userId && v.clients)
      .map((v) => v.clients!)
      .sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : 0));
    const t = tenants[0];
    if (!t?.evolution_instance || !t.notify_group_jid) {
      console.error("aviso ao dono pulado: o tenant do admin não tem destino de avisos ou instância");
      continue;
    }
    if (!saida.some((s) => mesmoDestino(s.destino, t.notify_group_jid))) {
      saida.push({ instancia: t.evolution_instance, destino: t.notify_group_jid });
    }
  }
  return saida;
}
