import { normalizar } from "@/lib/clientes";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import { PERIODOS } from "@/lib/periodo";
import {
  DIAS_DA_LINHA,
  OPCOES_PADRAO,
  POR_PAGINA_DE_CAMPANHAS,
  RECUSA_AO_APAGAR,
  campanhaAindaEnvia,
  contagemPorSemana,
  enviosPorDia,
  estadoNoMapa,
  leadSemHistorico,
  pontuarLead,
  problemasParaIniciar,
  respostasPorEspera,
  resultadoDaCampanha,
  resumoDaBase,
  siteDoLead,
  situacaoDoTelefone,
  nomeDaBusca,
  telefoneDoLead,
  type EnvioParaResultado,
} from "@/lib/prospeccao";
import {
  leadsDoFiltro,
  sinaisDoLead,
  type Busca,
  type Campanha,
  type CampanhaDaTabela,
  type CampanhaEditavel,
  type FonteDeCampanhas,
  type Lead,
  type LeadDaTabela,
  type Pagina,
  type RecorteDosLeads,
  type Resultados,
} from "@/components/admin/campanhas/tipos";
import { SITUACOES_DA_BUSCA, SITUACOES_DA_CAMPANHA } from "@/lib/campanhas-pedidos";
import { CONEXOES_DE_MENTIRA, resultadoDaBuscaDeMentira, type DadosDeMentira } from "./dados";

// A FONTE DE MENTIRA do preview (`/design/campanhas`): a MESMA interface da
// página de verdade (`FonteDeCampanhas`), respondendo de dados inventados em
// memória com as regras puras de `lib/prospeccao.ts` (o SQL de verdade tem os
// gêmeos dessas contas). Buscar, marcar, salvar e iniciar mudam só a memória da
// página; nada é gravado, nenhuma busca paga é chamada, nenhuma mensagem sai.

const pontos = (l: Lead) => pontuarLead(sinaisDoLead(l)).pontos;

const pagina = <T,>(lista: T[], n: number): Pagina<T> => ({
  itens: lista.slice((n - 1) * POR_PAGINA_DE_CAMPANHAS, n * POR_PAGINA_DE_CAMPANHAS),
  total: lista.length,
});


export function fonteDeMentira(dados: DadosDeMentira, agora: number): FonteDeCampanhas {
  const buscas = [...dados.buscas];
  let leads = dados.leads.map((l) => ({ ...l, campanhaIds: [...l.campanhaIds] }));
  let campanhas = dados.campanhas.map((c) => ({ ...c }));

  const responderam = () => new Set(campanhas.flatMap((c) => c.envios.filter((e) => e.respondeuEm !== null).map((e) => e.leadId)));
  const daBusca = (buscaId: string | null) => (buscaId === null ? leads : leads.filter((l) => l.buscaId === buscaId));
  const editavel = (c: Campanha): CampanhaEditavel => ({
    id: c.id,
    nome: c.nome,
    situacao: c.situacao,
    agendadaPara: c.agendadaPara,
    conexaoId: c.conexaoId,
    filtro: c.filtro,
    variantes: c.variantes,
    criadaEm: c.criadaEm,
    salvaEm: c.salvaEm,
    passo: c.passo,
  });
  /** Os leads do recorte da tabela, na ordem da pontuação (a mesma da tabela de verdade). */
  /** As categorias de um lead (as da fonte, ou o segmento de um lead de antes): o mesmo `coalesce` do SQL. */
  const categoriasDoLead = (l: Lead) => (l.detalhes?.categorias.length ? l.detalhes.categorias : [l.segmento]);
  const doRecorte = ({ buscaId, texto, cidade, filtros, site, notaMinima, minAvaliacoes, categorias, telefone }: RecorteDosLeads): Lead[] => {
    const q = normalizar(texto);
    const digitos = texto.replace(/\D/g, "");
    return daBusca(buscaId)
      .filter(
        (l) =>
          (!q || normalizar(l.nome).includes(q) || (digitos.length >= 3 && (l.telefone ?? "").replace(/\D/g, "").includes(digitos))) &&
          (cidade === null || l.cidade === cidade) &&
          (!filtros.includes("nao_contatados") || l.campanhaIds.length === 0) &&
          (!filtros.includes("bons") || l.marcacao === "bom") &&
          (site !== "sem_site" || siteDoLead(l.site) !== "sim") &&
          (site !== "com_site" || siteDoLead(l.site) === "sim") &&
          (notaMinima === null || (l.nota !== null && l.nota >= notaMinima)) &&
          (minAvaliacoes === null || (l.avaliacoes ?? 0) >= minAvaliacoes) &&
          (categorias.length === 0 || categoriasDoLead(l).some((c) => categorias.includes(c))) &&
          (!filtros.includes("nao_reivindicado") || l.detalhes?.reivindicado === false) &&
          (telefone === "todos" || situacaoDoTelefone(l.telefone) === telefone),
      )
      .sort((a, b) => pontos(b) - pontos(a) || a.nome.localeCompare(b.nome, "pt-BR"));
  };
  const enviosDosLeads = (ids: Set<string>) => campanhas.flatMap((c) => c.envios.filter((e) => ids.has(e.leadId)));

  return {
    async totais() {
      const contar = <K extends string>(chaves: K[], de: { situacao: K }[]) =>
        Object.fromEntries(chaves.map((k) => [k, de.filter((x) => x.situacao === k).length])) as Record<K, number>;
      return {
        leads: leads.length,
        buscas: contar(SITUACOES_DA_BUSCA, buscas),
        campanhas: contar(SITUACOES_DA_CAMPANHA, campanhas),
      };
    },

    async conexoes() {
      return CONEXOES_DE_MENTIRA;
    },

    async buscas({ texto, situacao, pagina: n }) {
      const q = normalizar(texto);
      const r = responderam();
      const lista = buscas
        .filter((b) => (situacao === null || b.situacao === situacao) && (!q || normalizar(`${b.termo} ${b.cidade}`).includes(q)))
        .map((b) => {
          const ls = daBusca(b.id);
          return {
            ...b,
            contagem: {
              total: ls.length,
              comCelular: ls.filter((l) => telefoneDoLead(l.telefone) !== null).length,
              bons: ls.filter((l) => l.marcacao === "bom").length,
              contatados: ls.filter((l) => l.campanhaIds.length > 0).length,
              responderam: ls.filter((l) => r.has(l.id)).length,
            },
          };
        });
      return pagina(lista, n);
    },

    async buscasParaEscolher() {
      return buscas;
    },

    async busca(id) {
      return buscas.find((b) => b.id === id) ?? null;
    },

    async novaBusca(opcoes) {
      const id = `b${Date.now()}`;
      buscas.unshift({ id, termo: nomeDaBusca(opcoes), cidade: opcoes.cidade, criadaEm: Date.now(), situacao: "buscando", total: 0, erro: null, opcoes });
      // A fonte de verdade avisa por webhook; aqui, alguns segundos de espera.
      window.setTimeout(() => {
        const ja = new Set(leads.map((l) => telefoneDoLead(l.telefone)).filter(Boolean));
        const achados = resultadoDaBuscaDeMentira(id, opcoes.termos[0] ?? "Empresa", opcoes.cidade, 3000 + leads.length);
        leads = [...leads, ...achados.filter((l) => !ja.has(telefoneDoLead(l.telefone)))];
        const b = buscas.find((x) => x.id === id);
        if (b) Object.assign(b, { situacao: "pronta", total: achados.length } satisfies Partial<Busca>);
      }, 4000);
      return { ok: true };
    },

    async leads({ pagina: n, ...recorte }) {
      const r = responderam();
      const nomes = new Map(campanhas.map((c) => [c.id, c.nome]));
      const lista: LeadDaTabela[] = doRecorte(recorte).map((l) => ({
        ...l,
        campanhas: l.campanhaIds.map((id) => ({ id, nome: nomes.get(id) ?? "" })),
        respondeu: r.has(l.id),
      }));
      return pagina(lista, n);
    },

    async paginaDoLead(recorte, leadId) {
      const i = doRecorte(recorte).findIndex((l) => l.id === leadId);
      return i < 0 ? null : Math.floor(i / POR_PAGINA_DE_CAMPANHAS) + 1;
    },

    async pontosDaBusca(buscaId) {
      const r = responderam();
      return daBusca(buscaId).flatMap((l) =>
        l.detalhes?.lat != null && l.detalhes.lng != null
          ? [{ id: l.id, nome: l.nome, lat: l.detalhes.lat, lng: l.detalhes.lng, estado: estadoNoMapa({ respondeu: r.has(l.id), campanhas: l.campanhaIds.length, marcacao: l.marcacao }) }]
          : [],
      );
    },

    async cidades(buscaId) {
      return [...new Set(daBusca(buscaId).map((l) => l.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },

    // No preview não há arquivo: a exportação some e a planilha devolve uma prévia de mentira.
    linkDaExportacao: () => null,

    async previaDaPlanilha() {
      return {
        ok: true,
        previa: {
          linhas: 12,
          colunas: { nome: "Empresa", telefone: "Celular", cidade: "Cidade" },
          validas: 10,
          invalidas: 1,
          exemplosInvalidos: [{ linha: 6, valor: "(33) 3300-0000" }],
          vazias: 0,
          repetidas: 1,
          jaNaBase: 2,
          pediramSair: 0,
          amostra: [
            { original: "33 90000-0001", comoFica: "+55 (33) 90000-0001" },
            { original: "(33)900000002", comoFica: "+55 (33) 90000-0002" },
          ],
        },
      };
    },

    async importarPlanilha(arquivo, nome) {
      const id = `b${Date.now()}`;
      const opcoes = { ...OPCOES_PADRAO, nome: nome || `Planilha ${arquivo.name}` };
      buscas.unshift({ id, termo: nomeDaBusca(opcoes), cidade: "", criadaEm: Date.now(), situacao: "pronta", total: 0, erro: null, opcoes });
      return { ok: true, buscaId: id };
    },

    async categorias(buscaId) {
      const n = new Map<string, number>();
      for (const l of daBusca(buscaId)) for (const c of categoriasDoLead(l)) if (c.trim()) n.set(c, (n.get(c) ?? 0) + 1);
      return [...n].map(([categoria, k]) => ({ categoria, n: k })).sort((a, b) => b.n - a.n || a.categoria.localeCompare(b.categoria, "pt-BR"));
    },

    async marcar(id, marcacao) {
      leads = leads.map((l) => (l.id === id ? { ...l, marcacao } : l));
      return marcacao;
    },

    async removerLead(id, buscaId) {
      const l = leads.find((x) => x.id === id);
      if (!l) return { ok: false, erro: RECUSA_AO_APAGAR.nao_encontrado };
      const fila = campanhas.some((c) => c.envios.some((e) => e.leadId === id && e.situacao === "na_fila"));
      if (fila) return { ok: false, erro: RECUSA_AO_APAGAR.na_fila };
      const livre = leadSemHistorico({ parouEm: l.parouEm, campanhas: l.campanhaIds.length });
      if (buscaId === null && !livre) return { ok: false, erro: RECUSA_AO_APAGAR.contatado };
      // Aqui cada lead tem uma lista só (`buscaId`): quem fica na base sai dela.
      leads = livre ? leads.filter((x) => x.id !== id) : leads.map((x) => (x.id === id ? { ...x, buscaId: "" } : x));
      return { ok: true };
    },

    async apagarBusca(id) {
      const b = buscas.find((x) => x.id === id);
      if (!b) return { ok: false, erro: RECUSA_AO_APAGAR.nao_encontrada };
      if (b.situacao === "buscando") return { ok: false, erro: RECUSA_AO_APAGAR.buscando };
      const naFila = new Set(campanhas.flatMap((c) => c.envios.filter((e) => e.situacao === "na_fila").map((e) => e.leadId)));
      if (daBusca(id).some((l) => naFila.has(l.id))) return { ok: false, erro: RECUSA_AO_APAGAR.na_fila };
      leads = leads
        .filter((l) => l.buscaId !== id || !leadSemHistorico({ parouEm: l.parouEm, campanhas: l.campanhaIds.length }))
        .map((l) => (l.buscaId === id ? { ...l, buscaId: "" } : l));
      buscas.splice(buscas.indexOf(b), 1);
      return { ok: true };
    },

    async editarTelefone(id, celular) {
      const l = leads.find((x) => x.id === id);
      if (!l) return { ok: false, erro: RECUSA_AO_APAGAR.nao_encontrado };
      if (!leadSemHistorico({ parouEm: l.parouEm, campanhas: l.campanhaIds.length })) return { ok: false, erro: RECUSA_AO_APAGAR.contatado };
      const telefone = telefoneDoLead(celular);
      if (!telefone) return { ok: false, erro: RECUSA_AO_APAGAR.invalido };
      if (leads.some((x) => x.id !== id && telefoneDoLead(x.telefone) === telefone)) return { ok: false, erro: RECUSA_AO_APAGAR.duplicado };
      leads = leads.map((x) => (x.id === id ? { ...x, telefone } : x));
      return { ok: true, telefone };
    },

    async painelDaBase(buscaId) {
      const ls = daBusca(buscaId);
      const r = responderam();
      const quando = new Map(buscas.map((b) => [b.id, b.criadaEm]));
      const ids = new Set(ls.map((l) => l.id));
      const envios = enviosDosLeads(ids);
      return {
        resumo: resumoDaBase(ls.map((l) => ({ ...sinaisDoLead(l), campanhas: l.campanhaIds.length, respondeu: r.has(l.id) }))),
        novosPorSemana: contagemPorSemana(
          ls.map((l) => quando.get(l.buscaId) ?? agora),
          agora,
          8,
        ),
        enviosPorSemana: contagemPorSemana(
          envios.map((e) => e.enviadoEm).filter((t): t is number => t !== null),
          agora,
          8,
        ),
        respostasPorDia: enviosPorDia(envios, diaIsoSP(agora), 14),
      };
    },

    async campanhas({ texto, situacao, pagina: n }) {
      const q = normalizar(texto);
      const hoje = diaIsoSP(agora);
      const lista: CampanhaDaTabela[] = campanhas
        .filter((c) => (situacao === null || c.situacao === situacao) && (!q || normalizar(c.nome).includes(q)))
        .map((c) => ({
          ...editavel(c),
          total: c.envios.length,
          enviados: c.envios.filter((e) => e.enviadoEm !== null).length,
          falharam: c.envios.filter((e) => e.situacao === "falhou").length,
          responderam: c.envios.filter((e) => e.respondeuEm !== null).length,
          serie: enviosPorDia(c.envios, hoje, DIAS_DA_LINHA),
        }));
      return pagina(lista, n);
    },

    async campanhasComEnvio() {
      return campanhas.filter((c) => c.envios.some((e) => e.enviadoEm !== null)).map((c) => ({ id: c.id, nome: c.nome }));
    },

    async resultados({ campanhaId, periodo }): Promise<Resultados> {
      const das = campanhaId === null ? campanhas : campanhas.filter((c) => c.id === campanhaId);
      const todos: EnvioParaResultado[] = das.flatMap((c) => c.envios);
      const variantes = das.length === 1 ? das[0].variantes.length : 3;
      const hoje = diaIsoSP(agora);
      if (periodo === null) {
        // Desde o início: os dias da campanha (do primeiro envio até hoje, de 7 a 30) nos mini gráficos.
        const primeiro = Math.min(...todos.map((e) => e.enviadoEm ?? Infinity));
        const dias = Number.isFinite(primeiro) ? Math.min(30, Math.max(7, Math.round((agora - primeiro) / 86_400_000) + 1)) : 7;
        return {
          atual: resultadoDaCampanha(todos, variantes),
          anterior: null,
          espera: respostasPorEspera(todos),
          serie: enviosPorDia(todos, hoje, dias),
        };
      }
      const dias = PERIODOS[periodo].dias;
      const de = inicioDoDiaSP(somarDias(hoje, -dias + 1));
      const deAntes = inicioDoDiaSP(somarDias(hoje, -2 * dias + 1));
      const naJanela = todos.filter((e) => e.enviadoEm !== null && e.enviadoEm >= de);
      return {
        atual: resultadoDaCampanha(naJanela, variantes),
        anterior: resultadoDaCampanha(
          todos.filter((e) => e.enviadoEm !== null && e.enviadoEm >= deAntes && e.enviadoEm < de),
          variantes,
        ),
        espera: respostasPorEspera(naJanela),
        serie: enviosPorDia(todos, hoje, Math.max(7, dias)),
      };
    },

    async campanha(id) {
      const c = campanhas.find((x) => x.id === id);
      if (!c) return null;
      const contar = (s: string) => c.envios.filter((e) => e.situacao === s).length;
      const hoje = inicioDoDiaSP(diaIsoSP(agora));
      return {
        campanha: editavel(c),
        contagens: { na_fila: contar("na_fila"), enviado: contar("enviado"), respondeu: contar("respondeu"), falhou: contar("falhou"), parou: contar("parou") },
        fila: { agora, proximoEnvioEm: null, enviadosHoje: c.envios.filter((e) => (e.enviadoEm ?? 0) >= hoje).length, agendadaPara: c.agendadaPara },
      };
    },

    async leadsDaCampanha(id, { texto, situacao, pagina: n }) {
      const c = campanhas.find((x) => x.id === id);
      const porLead = new Map(leads.map((l) => [l.id, l]));
      const q = normalizar(texto);
      const fila = (c?.envios ?? []).filter((e) => e.situacao === "na_fila");
      const lista = (c?.envios ?? [])
        .map((e, ordem) => ({ e: { ...e, ordem, posicaoNaFila: e.situacao === "na_fila" ? fila.indexOf(e) : null }, l: porLead.get(e.leadId) }))
        .filter(({ e, l }) => (situacao === null || e.situacao === situacao) && (!q || normalizar(l?.nome ?? "").includes(q)))
        .map(({ e, l }) => ({ ...e, nome: l?.nome ?? "Lead", bairro: l?.bairro ?? "", cidade: l?.cidade ?? "" }));
      return pagina(lista, n);
    },

    async previaDoFiltro(filtro) {
      const fila = leadsDoFiltro(leads, filtro, campanhas).sort((a, b) => pontos(b) - pontos(a));
      const origem = filtro.quemNaoRespondeuDe ? (campanhas.find((c) => c.id === filtro.quemNaoRespondeuDe)?.nome ?? null) : null;
      const jaContatados = filtro.quemNaoRespondeuDe
        ? 0
        : leadsDoFiltro(leads, { ...filtro, incluirJaContatados: true }, campanhas).length -
          leadsDoFiltro(leads, { ...filtro, incluirJaContatados: false }, campanhas).length;
      return { total: fila.length, primeiros: fila.slice(0, 8).map((l) => l.nome), origem, jaContatados };
    },

    async salvar(c) {
      const salvaEm = Date.now();
      const atual = campanhas.find((x) => x.id === c.id);
      if (atual && atual.situacao !== "rascunho") return atual.salvaEm;
      const nova: Campanha = { ...c, envios: atual?.envios ?? [], salvaEm };
      campanhas = atual ? campanhas.map((x) => (x.id === c.id ? nova : x)) : [nova, ...campanhas];
      return salvaEm;
    },

    async apagarCampanha(id) {
      const c = campanhas.find((x) => x.id === id);
      if (!c) return { ok: false, erro: RECUSA_AO_APAGAR.nao_encontrada };
      if (campanhaAindaEnvia(c.situacao)) return { ok: false, erro: RECUSA_AO_APAGAR.ativa };
      campanhas = campanhas.filter((x) => x.id !== id);
      return { ok: true };
    },

    async iniciar(id) {
      const c = campanhas.find((x) => x.id === id);
      if (!c || c.situacao !== "rascunho") return { ok: false, erro: "Esta campanha já foi iniciada." };
      const problemas = problemasParaIniciar({ ...c, agora: Date.now() });
      if (problemas.length > 0) return { ok: false, erro: problemas[0] };
      // A fila sai na ordem da pontuação: os melhores leads recebem primeiro.
      const fila: Lead[] = leadsDoFiltro(leads, c.filtro, campanhas).sort((a, b) => pontos(b) - pontos(a));
      if (fila.length === 0) return { ok: false, erro: "Ninguém nesse recorte." };
      const ids = new Set(fila.map((l) => l.id));
      leads = leads.map((l) => (ids.has(l.id) ? { ...l, campanhaIds: [...l.campanhaIds, id] } : l));
      const situacao = c.agendadaPara ? "agendada" : "rodando";
      Object.assign(c, {
        situacao,
        passo: 4,
        envios: fila.map((l) => ({ leadId: l.id, situacao: "na_fila" as const, variante: null, enviadoEm: null, respondeuEm: null })),
      });
      return { ok: true, situacao };
    },

    async pausar(id) {
      const c = campanhas.find((x) => x.id === id);
      if (c && (c.situacao === "rodando" || c.situacao === "agendada")) c.situacao = "pausada";
      return c?.situacao ?? "pausada";
    },

    async retomar(id) {
      const c = campanhas.find((x) => x.id === id);
      if (c && c.situacao === "pausada") c.situacao = c.agendadaPara && c.agendadaPara > Date.now() ? "agendada" : "rodando";
      return c?.situacao ?? "rodando";
    },
  };
}
