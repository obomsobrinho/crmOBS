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
import { estadoDaInstancia, logoutInstance } from "@/lib/evolution";
import { foraDaLista } from "@/lib/inbox-lista";
import { carregarJanelasDoPainel, carregarMotivosDoPainel, carregarSeriesDoPainel } from "@/lib/painel-dados";
import {
  SEM_EFEITOS,
  financeiroDe,
  nomeConfere,
  pendenciasDosEfeitos,
  type Cobranca,
  type EfeitosDoApagar,
  type FinanceiroDoCliente,
  type PedidoDeAcao,
} from "@/lib/admin-conta";
import {
  BOM_UTF8,
  COLUNAS_DO_CLIENTE,
  LEITURA_DA_EXPORTACAO,
  LOTE_DA_EXPORTACAO,
  TABELAS_DO_CLIENTE,
  ehObjeto,
  linhaCsv,
} from "@/lib/admin-purga";
import type { ArquivoDoZip } from "@/lib/zip";
import { AsaasError, deleteSubscription, subscriptionPayments } from "@/lib/asaas";
import type { Json } from "@/lib/database.types";

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
  const [base, extra, membros] = await Promise.all([
    empresaEFinanceiro(svc, id, agora, modelo),
    svc.from("clients").select("prompt_mode, notify_group_jid").eq("id", id).maybeSingle(),
    svc.rpc("tenant_members_do_cliente", { p_client: id }),
  ]);
  if (extra.error) throw extra.error;
  if (membros.error) throw membros.error;
  if (!base || !extra.data) return null;

  const pessoas = membros.data ?? [];
  return {
    ...base,
    agora,
    modoDoPrompt: extra.data.prompt_mode,
    avisosConfigurados: !!extra.data.notify_group_jid,
    donoEmail: pessoas.find((m) => m.role === "dono")?.email ?? null,
    membros: pessoas.length,
  };
}

/** As colunas de cobrança que a aba Financeiro mostra (os ids saem mascarados por `financeiroDe`). */
const COLUNAS_DO_FINANCEIRO =
  "billing_plan, billing_provider, billing_customer_id, billing_subscription_id, billing_seats, billing_updated_at";

/**
 * A linha da lista (`admin_empresas_pagina` com `p_id`) e o bloco do Financeiro de
 * UM cliente: o que o detalhe monta e o que a rota de uma ação devolve depois de
 * gravar (sem a leitura dos membros). `null` = não existe.
 */
export async function empresaEFinanceiro(
  svc: Supa,
  id: string,
  agora: number,
  modelo: string | null
): Promise<{ empresa: EmpresaItem; financeiro: FinanceiroDoCliente } | null> {
  const [lista, c] = await Promise.all([
    paginaDeClientes(svc, { agora, busca: "", depois: null, n: 1, modelo, id }),
    svc.from("clients").select(COLUNAS_DO_FINANCEIRO).eq("id", id).maybeSingle(),
  ]);
  if (c.error) throw c.error;
  const empresa = lista[0];
  if (!empresa || !c.data) return null;
  return { empresa, financeiro: financeiroDe(c.data) };
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

// ---------------------------------------------------------------------------
// ENTREGA 2: Financeiro, Ações, Apagar de vez e o aviso do BETA_ABERTO. Cada
// escrita é UMA função SQL com a linha em `admin_acoes` na mesma transação; as
// regras de validação e as respostas moram em `lib/admin-conta.ts` (puro).
// ---------------------------------------------------------------------------

/**
 * Uma ação do Financeiro ou das Ações (`admin_mudar_conta`): devolve a resposta
 * do SQL (`ok`, `sem_mudanca` ou o motivo da recusa). Um prazo que não cabe numa
 * data (`22008`) volta como `dias_invalidos`.
 */
export async function mudarConta(svc: Supa, admin: string, id: string, pedido: PedidoDeAcao): Promise<string> {
  const { data, error } = await svc.rpc("admin_mudar_conta", {
    p_quem: admin,
    p_client: id,
    p_acao: pedido.acao,
    p_dias: "dias" in pedido ? pedido.dias : undefined,
    p_plano: "plano" in pedido ? pedido.plano : undefined,
  });
  if (error) {
    if (error.code === "22008" || error.code === "22015") return "dias_invalidos";
    throw error;
  }
  return data;
}

/**
 * Quantos clientes ficariam BLOQUEADOS se `BETA_ABERTO` fosse desligado hoje
 * (`admin_bloqueados_sem_beta`, que espelha `accessState` em SQL). Uma contagem.
 */
export async function bloqueadosSemBeta(svc: Supa): Promise<number> {
  const { data, error } = await svc.rpc("admin_bloqueados_sem_beta", {});
  if (error) throw error;
  return Number(data) || 0;
}

/**
 * As cobranças da assinatura no Asaas, pelo helper que já existe
 * (`subscriptionPayments`, lib/asaas.ts: a primeira página que o Asaas devolve).
 * `undefined` = o cliente não existe; `null` = não tem assinatura no Asaas.
 */
export async function cobrancasDoCliente(svc: Supa, id: string): Promise<Cobranca[] | null | undefined> {
  const { data, error } = await svc
    .from("clients")
    .select("billing_provider, billing_subscription_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  if (!data.billing_subscription_id || data.billing_provider !== "asaas") return null;
  const pagamentos = await subscriptionPayments(data.billing_subscription_id);
  return pagamentos.map((p) => ({
    vencimento: p.dueDate,
    valor: p.value,
    status: p.status,
  }));
}

/** As linhas viram CSV; `comCabecalho` abre o arquivo (BOM e nomes das colunas). */
function* csvDoLote(linhas: Record<string, unknown>[], colunas: string[], comCabecalho: boolean): Generator<string> {
  if (comCabecalho) yield BOM_UTF8 + linhaCsv(colunas);
  let bloco = "";
  for (const l of linhas) bloco += linhaCsv(colunas.map((c) => l[c]));
  if (bloco) yield bloco;
}

/**
 * Uma tabela do cliente, lote a lote (`admin_exportar_lote`), pela ordem de
 * `LEITURA_DA_EXPORTACAO` (um índice que já existe) ou pela chave primária. Com
 * ordem, uma segunda passada pega as linhas de primeira coluna nula, que a
 * comparação de linha pula.
 */
async function* csvDaTabela(svc: Supa, tabela: (typeof TABELAS_DO_CLIENTE)[number], id: string): AsyncGenerator<string> {
  const leitura = LEITURA_DA_EXPORTACAO[tabela];
  const lote = leitura?.lote ?? LOTE_DA_EXPORTACAO;
  const ordem = leitura?.ordem ? [...leitura.ordem] : undefined;
  let colunas: string[] | null = null;
  for (const nulos of ordem ? [false, true] : [false]) {
    let depois: Json | undefined;
    for (;;) {
      const { data, error } = await svc.rpc("admin_exportar_lote", {
        p_tabela: tabela,
        p_client: id,
        p_depois: depois,
        p_limite: lote,
        p_ordem: ordem,
        p_nulos: nulos,
      });
      if (error) throw error;
      const linhas: Record<string, unknown>[] = [];
      for (const l of data ?? []) if (ehObjeto(l.linha)) linhas.push(l.linha);
      if (linhas.length > 0) {
        const primeira = colunas === null;
        const cols: string[] = colunas ?? Object.keys(linhas[0]);
        colunas = cols;
        yield* csvDoLote(linhas, cols, primeira);
      }
      if (!data || data.length < lote) break;
      depois = data[data.length - 1].chave;
    }
  }
  // Tabela sem linhas: o arquivo existe (um por tabela, decisão do dono) e diz isso.
  if (colunas === null) yield BOM_UTF8 + linhaCsv(["sem linhas"]);
}

/**
 * A EXPORTAÇÃO LGPD de um cliente (decisão do dono: um ZIP com UM CSV POR
 * TABELA): `cliente.csv` (a linha de `clients`), `membros.csv` (logins e papéis) e
 * um arquivo por tabela de `TABELAS_DO_CLIENTE`. Lida em lotes (memória limitada);
 * os arquivos do Storage não entram (só os caminhos, nas linhas). A exportação
 * deixa rastro em `admin_acoes` antes de começar. `null` = o cliente não existe.
 */
export async function exportacaoDoCliente(
  svc: Supa,
  admin: string,
  id: string
): Promise<{ nome: string; arquivos: AsyncGenerator<ArquivoDoZip> } | null> {
  const { data: c, error } = await svc.from("clients").select(COLUNAS_DO_CLIENTE).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!c) return null;
  const { data: registrado, error: regErr } = await svc.rpc("admin_registrar_exportacao", {
    p_quem: admin,
    p_client: id,
  });
  if (regErr) throw regErr;
  if (!registrado) return null;
  const linha: Record<string, unknown> = { ...c };

  async function* arquivos(): AsyncGenerator<ArquivoDoZip> {
    yield { nome: "cliente.csv", partes: csvDoLote([linha], Object.keys(linha), true) };
    const { data: membros, error: mErr } = await svc.rpc("tenant_members_do_cliente", { p_client: id });
    if (mErr) throw mErr;
    yield { nome: "membros.csv", partes: csvDoLote(membros ?? [], ["user_id", "email", "role"], true) };
    for (const t of TABELAS_DO_CLIENTE) yield { nome: `${t}.csv`, partes: csvDaTabela(svc, t, id) };
  }
  return { nome: c.name, arquivos: arquivos() };
}

/** Resultado do "Apagar de vez": a resposta do SQL e o que ficou para o dono resolver à mão. */
export interface ResultadoDoApagar {
  resultado: string;
  pendencias: string[];
}

/**
 * APAGAR DE VEZ (docs/adr/2026-10-15-two-step-company-deletion.md): UMA rotina, na
 * ordem que permite tentar de novo sem perder nada.
 * 1. Confere (cliente existe, está DESATIVADO, nome digitado igual) e se toda tabela
 *    com `client_id` está em `TABELAS_DO_CLIENTE` (`admin_tabelas_fora_da_purga`):
 *    com uma tabela nova esquecida, NADA acontece.
 * 2. Lê os logins que só pertencem a ele (antes: `user_clients` some com o banco).
 * 3. Cancela a assinatura no Asaas (`deleteSubscription`, o helper que existe).
 *    Falhou: para aqui, nada foi apagado. Outro provedor: não há integração, fica
 *    como pendência.
 * 4. Remove os arquivos do Storage (`{client_id}/...`, em lotes). Falhou: para aqui.
 * 5. Desconecta o WhatsApp (`logoutInstance`). NÃO existe helper para apagar a
 *    instância da Evolution: ela fica, e a pendência diz.
 * 6. O banco, numa transação, com o registro em `admin_acoes` que sobrevive
 *    (`admin_apagar_cliente`, que confere tudo de novo com a linha travada).
 * 7. Apaga os logins do passo 2 (nunca um id de `ADMIN_USER_IDS`).
 * Depois do primeiro efeito de fora (passo 3), toda parada ou erro passa por
 * `parar`: as pendências dizem o que JÁ foi feito (`pendenciasDosEfeitos`) e o log
 * leva o id do cliente; um erro do banco ali vira `falha_banco`, nunca um 500 mudo.
 */
export async function apagarCliente(
  svc: Supa,
  a: { admin: string; id: string; nome: string }
): Promise<ResultadoDoApagar> {
  const pendencias: string[] = [];
  const { data: c, error } = await svc
    .from("clients")
    .select("name, desativada_em, evolution_instance, billing_provider, billing_subscription_id")
    .eq("id", a.id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return { resultado: "nao_encontrado", pendencias };
  if (!c.desativada_em) return { resultado: "nao_desativado", pendencias };
  if (!nomeConfere(a.nome, c.name)) return { resultado: "nome_diferente", pendencias };

  const tabelas = [...TABELAS_DO_CLIENTE];
  const { data: fora, error: foraErr } = await svc.rpc("admin_tabelas_fora_da_purga", { p_tabelas: tabelas });
  if (foraErr) throw foraErr;
  if (fora && fora.length > 0) {
    console.error("apagar cliente: tabelas com client_id fora da rotina:", fora.join(", "));
    return { resultado: "tabela_fora_da_lista", pendencias: [`Tabelas fora da rotina: ${fora.join(", ")}`] };
  }

  const { data: sozinhos, error: uErr } = await svc.rpc("admin_usuarios_so_do_cliente", { p_client: a.id });
  if (uErr) throw uErr;
  const usuarios = (sozinhos ?? []).map((u) => u.user_id).filter((u) => !ehAdminPeloAmbiente(u));
  if (usuarios.length < (sozinhos ?? []).length) {
    pendencias.push("Um login do dono do produto só pertencia a este cliente e foi mantido.");
  }

  // Daqui em diante há efeitos FORA do banco (Asaas, Storage, Evolution). Qualquer
  // parada ou erro depois deles volta com o que já foi feito nas pendências (e no
  // log, com o id do cliente), para o dono nunca achar que nada mudou.
  const efeitos: EfeitosDoApagar = { ...SEM_EFEITOS };
  const parar = (resultado: string, motivo?: unknown): ResultadoDoApagar => {
    const feitos = pendenciasDosEfeitos(efeitos);
    if (motivo !== undefined || feitos.length > 0) {
      console.error(
        `apagar cliente ${a.id}: parou em ${resultado}; já feito:`,
        feitos.length > 0 ? feitos.join(" ") : "nada fora do banco",
        motivo instanceof Error ? motivo.message : (motivo ?? "")
      );
    }
    return { resultado, pendencias: [...pendencias, ...feitos] };
  };

  try {
    if (c.billing_subscription_id) {
      if (c.billing_provider === "asaas") {
        try {
          await deleteSubscription(c.billing_subscription_id);
          efeitos.assinaturaCancelada = true;
        } catch (e) {
          if (e instanceof AsaasError && e.status === 404) {
            pendencias.push("A assinatura já não existia no Asaas.");
          } else {
            return parar("falha_gateway", e);
          }
        }
      } else {
        console.error("apagar cliente: assinatura sem integração para cancelar, provedor:", c.billing_provider);
        pendencias.push(
          `A assinatura no provedor "${c.billing_provider ?? "desconhecido"}" não foi cancelada (não há integração): cancele no painel do provedor.`
        );
      }
    }

    const LOTE_DE_ARQUIVOS = 1000;
    let anterior: string | null = null;
    for (;;) {
      const { data: lote, error: aErr } = await svc.rpc("admin_arquivos_do_cliente", {
        p_client: a.id,
        p_limite: LOTE_DE_ARQUIVOS,
      });
      if (aErr) return parar("falha_arquivos", aErr);
      if (!lote || lote.length === 0) break;
      const primeiro = `${lote[0].bucket}/${lote[0].nome}`;
      // O lote não andou: a remoção não está surtindo efeito. Para antes do banco.
      if (primeiro === anterior) return parar("falha_arquivos", "o lote de arquivos não andou");
      anterior = primeiro;
      const porBalde = new Map<string, string[]>();
      for (const o of lote) porBalde.set(o.bucket, [...(porBalde.get(o.bucket) ?? []), o.nome]);
      for (const [balde, nomes] of porBalde) {
        const { error: rErr } = await svc.storage.from(balde).remove(nomes);
        if (rErr) return parar("falha_arquivos", rErr);
        efeitos.arquivosRemovidos += nomes.length;
      }
      // Lote incompleto: não sobrou mais nada (sem a chamada vazia do fim).
      if (lote.length < LOTE_DE_ARQUIVOS) break;
    }

    if (c.evolution_instance) {
      try {
        const res = await logoutInstance(c.evolution_instance);
        if (res.ok || res.status === 404) efeitos.whatsappDesconectado = true;
        else pendencias.push("Não deu para desconectar o WhatsApp na Evolution.");
      } catch {
        pendencias.push("Não deu para desconectar o WhatsApp na Evolution.");
      }
      pendencias.push(
        "A instância do WhatsApp continua criada na Evolution (o sistema não tem como apagá-la): apague no painel da Evolution."
      );
    }

    const { data: resultado, error: pErr } = await svc.rpc("admin_apagar_cliente", {
      p_quem: a.admin,
      p_client: a.id,
      p_nome: a.nome,
      p_tabelas: tabelas,
      p_usuarios: usuarios.length,
    });
    if (pErr) return parar("falha_banco", pErr);
    if (resultado !== "ok") return parar(resultado);
  } catch (e) {
    return parar("falha_banco", e);
  }

  for (const u of usuarios) {
    const { error: dErr } = await svc.auth.admin.deleteUser(u);
    if (dErr) {
      console.error("apagar cliente: falha ao apagar um login:", dErr.message);
      pendencias.push("Um login do cliente não foi apagado no Auth do Supabase.");
    }
  }
  return { resultado: "ok", pendencias };
}
