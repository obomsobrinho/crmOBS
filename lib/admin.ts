import "server-only";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Supa } from "@/lib/supabase/tipos";
import { ehAdminPeloAmbiente, ehUuid, idsDeAdmin, listaDeAdmins } from "@/lib/admin-acesso";
import { custoEstimadoUsd, mesSP } from "@/lib/custo-ia";
import { diaIsoSP } from "@/lib/fuso";
import { mesmoDestino } from "@/lib/avisos";
import { PAGINA_EMPRESAS, paraEmpresa, type EmpresaItem } from "@/lib/admin-empresas";
import {
  estadoDoWhatsApp,
  type EstadoDoWhatsApp,
  type FiltroDeSituacao,
  type LembretesComFalha,
  type PedidosEmAberto,
} from "@/lib/admin-alertas";
import {
  atendimentoPorPeriodo,
  atuaisEAnteriores,
  diasDoJson,
  janelaDeUso,
  janelasDoAtendimento,
  leituraDoHistorico,
  mesesDoJson,
  planoDoAtendimento,
  usoBruto,
  usoDoHistorico,
  type AtendimentoPorPeriodo,
  type DetalheDoCliente,
  type ModeloDoCliente,
  type SelecaoHistorica,
  type UsoBruto,
  type UsoHistorico,
} from "@/lib/admin-cliente";
import { instantesDaJanela, janelaDoChip, picosDoJson, type DadosDePicos, type JanelaDePicos } from "@/lib/picos";
import { ORDEM_PERIODOS, type PeriodoKey } from "@/lib/periodo";
import { normalizarRegras } from "@/lib/agent-prompt";
import { deleteInstance, estadoDaInstancia, logoutInstance } from "@/lib/evolution";
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
  TABELAS_DA_EXPORTACAO,
  TABELAS_DO_CLIENTE,
  TABELAS_MANTIDAS,
  ehObjeto,
  type TabelaDaExportacao,
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
  const linhas = data ?? [];
  const ids = linhas.map((l) => l.id);
  const [pedidos, lembretes] = await Promise.all([pedidosAbertosDaPagina(svc, ids), lembretesComFalhaDaPagina(svc, ids)]);
  return linhas.map((l) => paraEmpresa(l, a.modelo, a.agora, pedidos.get(l.id), lembretes.get(l.id)));
}

/**
 * Os pedidos de ajuda abertos dos clientes de UMA página (`admin_pedidos_abertos`,
 * uma chamada por página, nunca uma por cliente). Falha não derruba a lista: o
 * ícone some e o log diz (o que mais importa na central é a lista abrir).
 */
async function pedidosAbertosDaPagina(
  svc: Supa,
  ids: string[]
): Promise<Map<string, PedidosEmAberto>> {
  const mapa = new Map<string, PedidosEmAberto>();
  if (ids.length === 0) return mapa;
  const { data, error } = await svc.rpc("admin_pedidos_abertos", { p_clients: ids });
  if (error) {
    console.error("central: falha ao contar os pedidos de ajuda abertos:", error.message);
    return mapa;
  }
  for (const l of data ?? []) {
    mapa.set(l.client_id, { abertos: Number(l.abertos) || 0, maisAntigo: l.mais_antigo ?? null });
  }
  return mapa;
}

/**
 * Os lembretes da agenda que não saíram, dos clientes de UMA página
 * (`admin_lembretes_com_falha`, uma chamada por página). Falha (inclusive a
 * função ainda não existir, antes da migration) não derruba a lista: o ícone some.
 */
async function lembretesComFalhaDaPagina(svc: Supa, ids: string[]): Promise<Map<string, LembretesComFalha>> {
  const mapa = new Map<string, LembretesComFalha>();
  if (ids.length === 0) return mapa;
  const { data, error } = await svc.rpc("admin_lembretes_com_falha", { p_clients: ids });
  if (error) {
    console.error("central: falha ao contar os lembretes que não saíram:", error.message);
    return mapa;
  }
  for (const l of data ?? []) {
    mapa.set(l.client_id, { falhas: Number(l.falhas) || 0, maisAntiga: l.mais_antiga ?? null });
  }
  return mapa;
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
 * "Visão geral" usa (modo do prompt e destino de avisos, uma leitura por chave), os
 * membros e o modelo de IA do cliente (o do último turno, ou o do sistema). A cotação do dólar
 * NÃO entra aqui: a página a entrega ao navegador como promessa (`lib/use-cambio.ts`). O custo
 * estimado da linha é refeito com o preço do modelo DO CLIENTE. `null` = não existe.
 */
export async function detalheDoCliente(
  svc: Supa,
  id: string,
  agora: number,
  modeloDoSistema: string
): Promise<DetalheDoCliente | null> {
  const [base, extra, membros, modelo] = await Promise.all([
    empresaEFinanceiro(svc, id, agora, modeloDoSistema),
    svc.from("clients").select("prompt_mode, notify_group_jid").eq("id", id).maybeSingle(),
    svc.rpc("tenant_members_do_cliente", { p_client: id }),
    modeloDoCliente(svc, id, modeloDoSistema, agora),
  ]);
  if (extra.error) throw extra.error;
  if (membros.error) throw membros.error;
  if (!base || !extra.data) return null;

  const pessoas = membros.data ?? [];
  return {
    ...base,
    empresa: { ...base.empresa, custoUsd: custoEstimadoUsd(base.empresa.tokens, modelo.nome) },
    modelo,
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
 * O modelo de IA do cliente: o `model` do turno mais recente dele (o que ele realmente usa, bancada
 * excluída), ou o modelo atual do sistema quando ainda não teve turno com modelo. Uma leitura de uma
 * linha pelo índice `(client_id, created_at)`. O custo estimado de todo o período usa o preço dele.
 */
export async function modeloDoCliente(
  svc: Supa,
  id: string,
  doSistema: string,
  agora: number
): Promise<ModeloDoCliente> {
  // Primeiro só os turnos RECENTES (a faixa do índice `(client_id, created_at)` é curta mesmo para quem tem
  // muita bancada); só quando não há nenhum dentro dela é que a leitura volta ao histórico inteiro, que é o
  // caso raro (cliente parado há meses, ou que nunca teve turno).
  const ultimoTurno = async (desde: string | null) => {
    let consulta = svc
      .from("agent_turns")
      .select("model")
      .eq("client_id", id)
      .eq("dry_run", false)
      .not("model", "is", null);
    if (desde) consulta = consulta.gte("created_at", desde);
    const { data, error } = await consulta.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data?.model ?? null;
  };
  const nome =
    (await ultimoTurno(new Date(agora - JANELA_DO_MODELO_DIAS * 86_400_000).toISOString())) ??
    (await ultimoTurno(null));
  return nome ? { nome, origem: "ultimo_turno" } : { nome: doSistema, origem: "sistema" };
}

/** Quantos dias para trás a primeira leitura do modelo do cliente olha (o resto cai na leitura do histórico inteiro). */
const JANELA_DO_MODELO_DIAS = 61;

/** Os turnos por dia e por dia da semana x hora de cada janela (`admin_cliente_picos`, UMA chamada, até 8 janelas). */
async function picosDasJanelas(svc: Supa, id: string, janelas: JanelaDePicos[]): Promise<DadosDePicos[]> {
  const instantes = janelas.map(instantesDaJanela);
  const { data, error } = await svc.rpc("admin_cliente_picos", {
    p_client: id,
    p_de: instantes.map((i) => i.de),
    p_ate: instantes.map((i) => i.ate),
  });
  if (error) throw error;
  const lista = Array.isArray(data) ? data : [];
  return janelas.map((_, i) => picosDoJson(lista[i]));
}

/** Os dias de uso de uma janela de dias civis (`admin_cliente_uso` com os instantes dela; sem grade). */
async function diasDeUsoDaJanela(svc: Supa, id: string, janela: JanelaDePicos) {
  const j = instantesDaJanela(janela);
  const { data, error } = await svc.rpc("admin_cliente_uso", {
    p_client: id,
    p_de: j.de,
    p_ate: j.ate,
    p_cubo_de: j.ate,
  });
  if (error) throw error;
  return diasDoJson(data);
}

/**
 * O uso de IA de um cliente: por dia nos últimos 61 dias (`admin_cliente_uso`: os 30 dias do período
 * mais os 30 anteriores, base da variação), por hora nas últimas 48 horas (`admin_cliente_uso_horas`: hoje e
 * ontem), o primeiro turno do cliente e os picos de cada chip (`admin_cliente_picos`), tudo em paralelo.
 */
export async function usoDoCliente(svc: Supa, id: string, agora: number): Promise<UsoBruto> {
  const j = janelaDeUso(agora);
  const hoje = diaIsoSP(agora);
  const [porDia, porHora, primeira, picos] = await Promise.all([
    // `p_cubo_de` é obrigatório na função implantada; igual a `p_ate`, a grade (que ninguém mais lê) vem vazia.
    svc.rpc("admin_cliente_uso", { p_client: id, p_de: j.de, p_ate: j.ate, p_cubo_de: j.ate }),
    svc.rpc("admin_cliente_uso_horas", { p_client: id, p_de: j.horasDe, p_ate: j.ate }),
    primeiraAtividadeDoCliente(svc, id),
    picosDasJanelas(svc, id, ORDEM_PERIODOS.map((k) => janelaDoChip(k, hoje))),
  ]);
  if (porDia.error) throw porDia.error;
  if (porHora.error) throw porHora.error;
  const bruto = usoBruto(porDia.data, porHora.data, primeira);
  return {
    ...bruto,
    picos: Object.fromEntries(ORDEM_PERIODOS.map((k, i) => [k, picos[i]])) as Record<PeriodoKey, DadosDePicos>,
  };
}

/**
 * O dia civil (AAAA-MM-DD, São Paulo) do PRIMEIRO turno do cliente, ou `null`: limita os meses
 * do seletor de período. Uma leitura de uma linha pelo índice `(client_id, created_at)`.
 */
async function primeiraAtividadeDoCliente(svc: Supa, id: string): Promise<string | null> {
  const { data, error } = await svc
    .from("agent_turns")
    .select("created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? diaIsoSP(new Date(data.created_at)) : null;
}

/** Os meses (`admin_cliente_uso_meses`) de uma janela de dias civis, só os turnos que caem dentro dela. */
async function mesesDeUsoDaJanela(svc: Supa, id: string, janela: JanelaDePicos) {
  const j = instantesDaJanela(janela);
  const { data, error } = await svc.rpc("admin_cliente_uso_meses", { p_client: id, p_de: j.de, p_ate: j.ate });
  if (error) throw error;
  return mesesDoJson(data);
}

/**
 * O uso de um mês civil (o atual ou um passado, por dia), de TODO o período (por mês) ou de um
 * INTERVALO escolhido (por dia até 62 dias, por mês acima), com os picos da mesma janela e a base da
 * variação (o mês anterior, ou o intervalo anterior de mesmo tamanho). Os picos e o uso saem juntos, em
 * paralelo, e a janela volta junto para a tela desenhar as colunas por data e a média.
 */
export async function usoHistoricoDoCliente(
  svc: Supa,
  id: string,
  agora: number,
  modeloDoSistema: string,
  selecao: SelecaoHistorica
): Promise<UsoHistorico> {
  const hoje = diaIsoSP(agora);
  // "Todo o período" precisa do primeiro dia de uso ANTES de saber que janelas ler; as outras não.
  const primeira = selecao.tipo === "tudo" ? await primeiraAtividadeDoCliente(svc, id) : null;
  // O QUE ler é a regra pura de `leituraDoHistorico` (a mesma do preview); aqui só se lê, tudo em paralelo,
  // inclusive o modelo do cliente (o custo estimado usa o preço dele).
  const l = leituraDoHistorico(selecao, hoje, primeira);
  const [dias, anteriores, meses, [picos], modelo] = await Promise.all([
    l.dias ? diasDeUsoDaJanela(svc, id, l.dias) : Promise.resolve([]),
    l.anteriores ? diasDeUsoDaJanela(svc, id, l.anteriores) : Promise.resolve(null),
    l.meses ? mesesDeUsoDaJanela(svc, id, l.meses) : Promise.resolve([]),
    picosDasJanelas(svc, id, [l.janela]),
    modeloDoCliente(svc, id, modeloDoSistema, agora),
  ]);
  const uso = usoDoHistorico(
    selecao,
    { dias, anteriores, meses },
    { janela: l.janela, agora, modelo: modelo.nome, primeira }
  );
  return { uso, picos, janela: l.janela };
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

  // As janelas atuais e as anteriores (a base dos selos de variação) vão numa chamada SÓ de `painel_janelas`, como
  // o painel faz: uma chamada por lista refazia a janela do acumulado (todo o histórico) duas vezes.
  const plano = planoDoAtendimento(agora);
  const [todas, series, motivos, solucoes] = await Promise.all([
    carregarJanelasDoPainel(svc, { clientId: id, avisos: c.notify_group_jid, agora, janelas: plano.lista }),
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

  const { atuais, anteriores } = atuaisEAnteriores(todas, plano);
  return atendimentoPorPeriodo({
    janelas: atuais,
    anteriores,
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
// ENTREGA 2: Financeiro, Ações e Apagar de vez. Cada
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
async function* csvDaTabela(svc: Supa, tabela: TabelaDaExportacao, id: string): AsyncGenerator<string> {
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
 * um arquivo por tabela de `TABELAS_DA_EXPORTACAO` (as apagadas e as mantidas). Lida em lotes (memória limitada);
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
    for (const t of TABELAS_DA_EXPORTACAO) yield { nome: `${t}.csv`, partes: csvDaTabela(svc, t, id) };
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
 *    com `client_id` está em `TABELAS_DO_CLIENTE` ou em `TABELAS_MANTIDAS`
 *    (`admin_tabelas_fora_da_purga`):
 *    com uma tabela nova esquecida, NADA acontece.
 * 2. Lê os logins que só pertencem a ele (antes: `user_clients` some com o banco).
 * 3. Cancela a assinatura no Asaas (`deleteSubscription`, o helper que existe).
 *    Falhou: para aqui, nada foi apagado. Outro provedor: não há integração, fica
 *    como pendência.
 * 4. Remove os arquivos do Storage (`{client_id}/...`, em lotes). Falhou: para aqui.
 * 5. Desconecta o WhatsApp (`logoutInstance`) e apaga a instância na Evolution
 *    (`deleteInstance`; 404 = já não existia). Uma falha aqui não para a rotina:
 *    vira pendência.
 * 6. O banco, numa transação, com o registro em `admin_acoes` que sobrevive
 *    (`admin_apagar_cliente`, que confere tudo de novo com a linha travada). As
 *    `TABELAS_MANTIDAS` (o histórico de cobrança) ficam, marcadas com o id e o nome
 *    do cliente apagado.
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
  const mantidas = [...TABELAS_MANTIDAS];
  const { data: fora, error: foraErr } = await svc.rpc("admin_tabelas_fora_da_purga", {
    p_tabelas: [...tabelas, ...mantidas],
  });
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
      // Desconecta e depois APAGA a instância. Não para a rotina: o que falhar
      // vira pendência para o dono resolver no painel da Evolution. 404 = a
      // instância já não existe (uma nova tentativa depois de uma parada).
      let desconectou = false;
      try {
        const res = await logoutInstance(c.evolution_instance);
        if (res.ok || res.status === 404) {
          desconectou = true;
          efeitos.whatsappDesconectado = true;
        }
      } catch {
        // A exclusão abaixo também derruba a sessão; só vira pendência se ela falhar.
      }
      try {
        const res = await deleteInstance(c.evolution_instance);
        if (res.ok || res.status === 404) efeitos.instanciaApagada = true;
      } catch {
        // Fica como pendência abaixo.
      }
      if (!efeitos.instanciaApagada) {
        if (!desconectou) pendencias.push("Não deu para desconectar o WhatsApp na Evolution.");
        pendencias.push("Não deu para apagar a instância do WhatsApp na Evolution: apague no painel da Evolution.");
      }
    }

    const { data: resultado, error: pErr } = await svc.rpc("admin_apagar_cliente", {
      p_quem: a.admin,
      p_client: a.id,
      p_nome: a.nome,
      p_tabelas: tabelas,
      p_mantidas: mantidas,
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
