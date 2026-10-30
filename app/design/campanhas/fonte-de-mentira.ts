import { normalizar } from "@/lib/clientes";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import { PERIODOS } from "@/lib/periodo";
import {
  contagemPorSemana,
  enviosPorDia,
  pontuarLead,
  problemasParaIniciar,
  respostasPorEspera,
  resultadoDaCampanha,
  resumoDaBase,
  siteDoLead,
  telefoneDoLead,
  type EnvioParaResultado,
} from "@/lib/prospeccao";
import {
  leadsDoFiltro,
  type Busca,
  type Campanha,
  type CampanhaDaTabela,
  type CampanhaEditavel,
  type FonteDeCampanhas,
  type Lead,
  type LeadDaTabela,
  type Pagina,
  type Resultados,
} from "@/components/admin/campanhas/tipos";
import { POR_PAGINA } from "@/components/admin/campanhas/tabela";
import { CONEXOES_DE_MENTIRA, resultadoDaBuscaDeMentira, type DadosDeMentira } from "./dados";

// A FONTE DE MENTIRA do preview (`/design/campanhas`): a MESMA interface da
// página de verdade (`FonteDeCampanhas`), respondendo de dados inventados em
// memória com as regras puras de `lib/prospeccao.ts` (o SQL de verdade tem os
// gêmeos dessas contas). Buscar, marcar, salvar e iniciar mudam só a memória da
// página; nada é gravado, nenhuma busca paga é chamada, nenhuma mensagem sai.

const pagina = <T,>(lista: T[], n: number): Pagina<T> => ({
  itens: lista.slice((n - 1) * POR_PAGINA, n * POR_PAGINA),
  total: lista.length,
});

const DIAS_DA_LINHA = 14;

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
  const enviosDosLeads = (ids: Set<string>) => campanhas.flatMap((c) => c.envios.filter((e) => ids.has(e.leadId)));

  return {
    async totais() {
      const contar = <K extends string>(chaves: K[], de: { situacao: K }[]) =>
        Object.fromEntries(chaves.map((k) => [k, de.filter((x) => x.situacao === k).length])) as Record<K, number>;
      return {
        leads: leads.length,
        buscas: contar(["buscando", "pronta", "falhou"], buscas),
        campanhas: contar(["rascunho", "agendada", "rodando", "pausada", "concluida"], campanhas),
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
      buscas.unshift({ id, termo: opcoes.termos.join(", "), cidade: opcoes.cidade, criadaEm: Date.now(), situacao: "buscando", total: 0, erro: null, opcoes });
      // A fonte de verdade avisa por webhook; aqui, alguns segundos de espera.
      window.setTimeout(() => {
        const ja = new Set(leads.map((l) => telefoneDoLead(l.telefone)).filter(Boolean));
        const achados = resultadoDaBuscaDeMentira(id, opcoes.termos[0], opcoes.cidade, 3000 + leads.length);
        leads = [...leads, ...achados.filter((l) => !ja.has(telefoneDoLead(l.telefone)))];
        const b = buscas.find((x) => x.id === id);
        if (b) Object.assign(b, { situacao: "pronta", total: achados.length } satisfies Partial<Busca>);
      }, 4000);
      return { ok: true };
    },

    async leads({ buscaId, texto, cidade, filtros, pagina: n }) {
      const q = normalizar(texto);
      const digitos = texto.replace(/\D/g, "");
      const r = responderam();
      const nomes = new Map(campanhas.map((c) => [c.id, c.nome]));
      const lista: LeadDaTabela[] = daBusca(buscaId)
        .filter(
          (l) =>
            (!q || normalizar(l.nome).includes(q) || (digitos.length >= 3 && (l.telefone ?? "").replace(/\D/g, "").includes(digitos))) &&
            (cidade === null || l.cidade === cidade) &&
            (!filtros.includes("nao_contatados") || l.campanhaIds.length === 0) &&
            (!filtros.includes("bons") || l.marcacao === "bom") &&
            (!filtros.includes("sem_site") || siteDoLead(l.site) !== "sim") &&
            (!filtros.includes("nota") || (l.nota ?? 0) >= 4.5),
        )
        .sort((a, b) => pontuarLead(b).pontos - pontuarLead(a).pontos || a.nome.localeCompare(b.nome, "pt-BR"))
        .map((l) => ({ ...l, campanhas: l.campanhaIds.map((id) => ({ id, nome: nomes.get(id) ?? "" })), respondeu: r.has(l.id) }));
      return pagina(lista, n);
    },

    async cidades(buscaId) {
      return [...new Set(daBusca(buscaId).map((l) => l.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },

    async marcar(id, marcacao) {
      leads = leads.map((l) => (l.id === id ? { ...l, marcacao } : l));
      return marcacao;
    },

    async painelDaBase(buscaId) {
      const ls = daBusca(buscaId);
      const r = responderam();
      const quando = new Map(buscas.map((b) => [b.id, b.criadaEm]));
      const ids = new Set(ls.map((l) => l.id));
      const envios = enviosDosLeads(ids);
      return {
        resumo: resumoDaBase(ls.map((l) => ({ ...l, campanhas: l.campanhaIds.length, respondeu: r.has(l.id) }))),
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
      return {
        campanha: editavel(c),
        contagens: { na_fila: contar("na_fila"), enviado: contar("enviado"), respondeu: contar("respondeu"), falhou: contar("falhou"), parou: contar("parou") },
      };
    },

    async leadsDaCampanha(id, { texto, situacao, pagina: n }) {
      const c = campanhas.find((x) => x.id === id);
      const porLead = new Map(leads.map((l) => [l.id, l]));
      const q = normalizar(texto);
      const lista = (c?.envios ?? [])
        .map((e) => ({ e, l: porLead.get(e.leadId) }))
        .filter(({ e, l }) => (situacao === null || e.situacao === situacao) && (!q || normalizar(l?.nome ?? "").includes(q)))
        .map(({ e, l }) => ({ ...e, nome: l?.nome ?? "Lead", bairro: l?.bairro ?? "", cidade: l?.cidade ?? "" }));
      return pagina(lista, n);
    },

    async previaDoFiltro(filtro) {
      const fila = leadsDoFiltro(leads, filtro, campanhas).sort((a, b) => pontuarLead(b).pontos - pontuarLead(a).pontos);
      const origem = filtro.quemNaoRespondeuDe ? (campanhas.find((c) => c.id === filtro.quemNaoRespondeuDe)?.nome ?? null) : null;
      return { total: fila.length, primeiros: fila.slice(0, 8).map((l) => l.nome), origem };
    },

    async salvar(c) {
      const salvaEm = Date.now();
      const atual = campanhas.find((x) => x.id === c.id);
      if (atual && atual.situacao !== "rascunho") return atual.salvaEm;
      const nova: Campanha = { ...c, envios: atual?.envios ?? [], salvaEm };
      campanhas = atual ? campanhas.map((x) => (x.id === c.id ? nova : x)) : [nova, ...campanhas];
      return salvaEm;
    },

    async iniciar(id) {
      const c = campanhas.find((x) => x.id === id);
      if (!c || c.situacao !== "rascunho") return { ok: false, erro: "Esta campanha já foi iniciada." };
      const problemas = problemasParaIniciar({ ...c, agora: Date.now() });
      if (problemas.length > 0) return { ok: false, erro: problemas[0] };
      // A fila sai na ordem da pontuação: os melhores leads recebem primeiro.
      const fila: Lead[] = leadsDoFiltro(leads, c.filtro, campanhas).sort((a, b) => pontuarLead(b).pontos - pontuarLead(a).pontos);
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
