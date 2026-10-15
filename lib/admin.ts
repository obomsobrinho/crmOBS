import "server-only";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Supa } from "@/lib/supabase/tipos";
import { ehAdminPeloAmbiente, ehUuid, idsDeAdmin, listaDeAdmins } from "@/lib/admin-acesso";
import { mesSP } from "@/lib/custo-ia";
import { mesmoDestino } from "@/lib/avisos";
import { PAGINA_EMPRESAS, paraEmpresa, type EmpresaItem } from "@/lib/admin-empresas";
import { estadoDoWhatsApp, type EstadoDoWhatsApp, type FiltroDeSituacao } from "@/lib/admin-alertas";
import {
  atendimentoPorPeriodo,
  janelaDeUso,
  janelasDoAtendimento,
  usoBruto,
  type AtendimentoPorPeriodo,
  type DetalheDoCliente,
  type UsoBruto,
} from "@/lib/admin-cliente";
import { normalizarRegras } from "@/lib/agent-prompt";
import { estadoDaInstancia } from "@/lib/evolution";
import { foraDaLista } from "@/lib/inbox-lista";
import { carregarJanelasDoPainel, carregarMotivosDoPainel, carregarSeriesDoPainel } from "@/lib/painel-dados";

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
 * A GUARDA DE TODA ROTA DA CENTRAL (`/api/admin/*`): 404 para quem não é admin
 * (nunca 403, para não revelar que existe), 400 para um id que não é uuid, e o
 * handler só roda com o admin e o id JÁ validados. Rota que ESCREVE passa
 * `revalidar: true`. Rota sem `[id]` (a lista) passa `semId: true`. Uma guarda
 * por rota, num lugar só: `e2e/central-clientes-lib.design.spec.ts` prova que
 * toda rota da central a usa.
 */
export function rotaDoAdmin(
  handler: (a: { req: NextRequest; admin: string; id: string }) => Promise<Response>,
  opcoes?: { revalidar?: boolean }
): (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
export function rotaDoAdmin(
  handler: (a: { req: NextRequest; admin: string }) => Promise<Response>,
  opcoes: { revalidar?: boolean; semId: true }
): (req: NextRequest) => Promise<Response>;
export function rotaDoAdmin(
  handler: (a: { req: NextRequest; admin: string; id: string }) => Promise<Response>,
  opcoes: { revalidar?: boolean; semId?: boolean } = {}
) {
  return async (req: NextRequest, ctx?: { params: Promise<{ id: string }> }): Promise<Response> => {
    const admin = await adminDaSessao({ revalidar: opcoes.revalidar });
    if (!admin) return new NextResponse("Not Found", { status: 404 });
    let id = "";
    if (!opcoes.semId && ctx) {
      id = (await ctx.params).id;
      if (!ehUuid(id)) return NextResponse.json({ error: "id de cliente inválido" }, { status: 400 });
    }
    return handler({ req, admin, id });
  };
}

/**
 * A GUARDA DE TODA PÁGINA DA CENTRAL (`/clientes`, `/clientes/[id]`): devolve o
 * id do admin, ou REDIRECIONA. Quem não é admin NUNCA recebe 404 (revelaria o
 * caminho): vai a `/contatos`, ou a `/contatos/{id}` quando o id é um contato do
 * tenant da própria pessoa (`destinoDoNaoAdmin`). Para o admin, um `id` que não é
 * uuid (link antigo de Contatos, que tem id numérico) segue o mesmo caminho. A
 * decisão é do servidor; esconder um botão nunca é a trava.
 */
export async function adminDaPagina(id: string | null = null): Promise<string> {
  const admin = await adminDaSessao();
  if (admin && (id === null || ehUuid(id))) return admin;
  redirect(await destinoDoNaoAdmin(id));
}

/**
 * Para onde vai quem NÃO é o dono do produto e abriu `/clientes` ou
 * `/clientes/[id]` (links antigos de Contatos continuam valendo). Um id numérico
 * que é contato do tenant DA PESSOA (RLS, sessão dela) leva a `/contatos/{id}`;
 * qualquer outra coisa leva a `/contatos`. Nada aqui revela que a central existe.
 */
async function destinoDoNaoAdmin(id: string | null): Promise<string> {
  const n = id !== null && /^\d+$/.test(id) ? Number(id) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) return "/contatos";
  const supabase = await createClient();
  const { data } = await supabase.from("dados_cliente").select("id").eq("id", n).maybeSingle();
  return data ? `/contatos/${data.id}` : "/contatos";
}

/**
 * Uma página da lista de Clientes (ordem de nome, busca e filtro no banco). `n` vai cru:
 * quem limita o tamanho (1 a 50) é o SQL. Com `id`, devolve só aquele cliente, pela
 * MESMA seleção da lista (é como o detalhe monta a linha).
 */
export async function paginaDeClientes(
  svc: Supa,
  a: {
    agora: number;
    busca: string;
    depois: { nome: string; id: string } | null;
    n?: number;
    modelo: string | null;
    /** Filtro de situação (`subscription_status` gravado); nulo = todos. */
    situacao?: FiltroDeSituacao | null;
    id?: string;
  }
): Promise<EmpresaItem[]> {
  const { data, error } = await svc.rpc("admin_empresas_pagina", {
    p_mes: mesSP(a.agora),
    p_busca: a.busca.trim() || null,
    p_cursor_nome: a.depois?.nome ?? null,
    p_cursor_id: a.depois?.id ?? null,
    p_limite: a.n ?? PAGINA_EMPRESAS,
    p_situacao: a.situacao ?? null,
    p_id: a.id ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((l) => paraEmpresa(l, a.modelo, a.agora));
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

// ---------------------------------------------------------------------------
// A CENTRAL "CLIENTES" (docs/plano-central-clientes.md, entrega 1). Tudo abaixo
// roda com service_role no servidor e só depois da guarda (`adminDaPagina` na
// página, `rotaDoAdmin` na rota). A regra de cada número fica nos módulos puros
// (`lib/admin-alertas.ts`, `lib/admin-cliente.ts`, `lib/custo-ia.ts`, painel).
// ---------------------------------------------------------------------------

/**
 * O cliente do detalhe: a MESMA linha da lista (`admin_empresas_pagina` com
 * `p_id`, que traz o contador do mês e a última atividade), mais o que só a
 * "Visão geral" usa (modo do prompt e destino de avisos, uma leitura por chave) e
 * os membros. `null` = não existe.
 */
export async function detalheDoCliente(
  svc: Supa,
  id: string,
  agora: number,
  modelo: string | null
): Promise<DetalheDoCliente | null> {
  const [lista, extra, membros] = await Promise.all([
    paginaDeClientes(svc, { agora, busca: "", depois: null, n: 1, modelo, id }),
    svc.from("clients").select("prompt_mode, notify_group_jid").eq("id", id).maybeSingle(),
    svc.rpc("tenant_members_do_cliente", { p_client: id }),
  ]);
  if (extra.error) throw extra.error;
  if (membros.error) throw membros.error;
  const empresa = lista[0];
  if (!empresa || !extra.data) return null;

  const pessoas = membros.data ?? [];
  return {
    empresa,
    agora,
    modoDoPrompt: extra.data.prompt_mode,
    avisosConfigurados: !!extra.data.notify_group_jid,
    donoEmail: pessoas.find((m) => m.role === "dono")?.email ?? null,
    membros: pessoas.length,
  };
}

/**
 * O uso de IA de um cliente por dia e por dia da semana x hora
 * (`admin_cliente_uso`, 31 e 30 dias) e por hora nas últimas 25 horas
 * (`admin_cliente_uso_horas`), as duas em paralelo.
 */
export async function usoDoCliente(svc: Supa, id: string, agora: number): Promise<UsoBruto> {
  const j = janelaDeUso(agora);
  const [porDia, porHora] = await Promise.all([
    svc.rpc("admin_cliente_uso", { p_client: id, p_de: j.de, p_ate: j.ate, p_cubo_de: j.cuboDe }),
    svc.rpc("admin_cliente_uso_horas", { p_client: id, p_de: j.horasDe, p_ate: j.ate }),
  ]);
  if (porDia.error) throw porDia.error;
  if (porHora.error) throw porHora.error;
  return usoBruto(porDia.data, porHora.data);
}

/**
 * A aba Atendimento, os QUATRO períodos do painel de uma vez: UMA chamada de
 * `painel_janelas` (a mesma função de carga do painel, `carregarJanelasDoPainel`),
 * UMA de `painel_series` (as colunas do gráfico de respostas, `carregarSeriesDoPainel`),
 * UMA de `painel_motivos` e UMA de `admin_cliente_solucoes`, todas com as quatro
 * janelas em array, depois de UMA leitura do cliente. As contas são as do painel
 * (conversas, sem intervenção humana, respostas da IA, mediana do primeiro
 * atendimento, "passou para o time"); o número de avisos do cliente fica fora de
 * tudo, como no painel. `null` = o cliente não existe.
 */
export async function atendimentoDoCliente(
  svc: Supa,
  id: string,
  agora: number
): Promise<AtendimentoPorPeriodo | null> {
  const { data: c, error } = await svc
    .from("clients")
    .select("notify_group_jid, regras_salvas")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const janelas = janelasDoAtendimento(agora);
  const iso = (ms: number) => new Date(ms).toISOString();

  const [linhas, series, motivos, solucoes] = await Promise.all([
    carregarJanelasDoPainel(svc, { clientId: id, avisos: c.notify_group_jid, agora, janelas }),
    carregarSeriesDoPainel(svc, { clientId: id, avisos: c.notify_group_jid, agora, mes: null }),
    carregarMotivosDoPainel(svc, { clientId: id, avisos: c.notify_group_jid, janelas }),
    svc.rpc("admin_cliente_solucoes", {
      p_client: id,
      p_fora: foraDaLista(c.notify_group_jid),
      p_de: janelas.map((j) => iso(j.de)),
      p_ate: janelas.map((j) => iso(j.ate)),
    }),
  ]);
  if (solucoes.error) throw solucoes.error;

  return atendimentoPorPeriodo({
    janelas: linhas,
    motivos,
    solucoes: (solucoes.data ?? []).map((l) => ({
      janela: l.janela,
      solucao: l.solucao ?? null,
      aberto: l.aberto,
      n: l.n,
    })),
    regrasSalvas: normalizarRegras(c.regras_salvas).length,
    series,
    agora,
  });
}

/**
 * O estado do WhatsApp de UM cliente, ao vivo na Evolution (só o detalhe pede,
 * nunca a lista). Sem instância ou com falha, `desconhecido`; `null` = o cliente
 * não existe.
 */
export async function whatsappDoCliente(svc: Supa, id: string): Promise<EstadoDoWhatsApp | null> {
  const { data, error } = await svc.from("clients").select("evolution_instance").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!data.evolution_instance) return "desconhecido";
  try {
    return estadoDoWhatsApp(await estadoDaInstancia(data.evolution_instance));
  } catch {
    return "desconhecido";
  }
}
