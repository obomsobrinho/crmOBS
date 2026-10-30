import type {
  Busca,
  BuscaDaTabela,
  CampanhaAberta,
  CampanhaDaTabela,
  ConexaoDisponivel,
  FonteDeCampanhas,
  LeadDaTabela,
  LeadNaCampanha,
  Pagina,
  PreviaDoFiltro,
  Resultados,
  RespostaDeIniciar,
  Totais,
} from "@/components/admin/campanhas/tipos";
import type { MarcacaoDoLead, ResumoDobrado, SituacaoDaCampanha } from "./prospeccao";

// DE ONDE A TELA DE CAMPANHAS TIRA OS DADOS na página de verdade: as rotas
// `/api/admin/campanhas/*` (service_role no servidor, contas no SQL, páginas de
// 10). O navegador nunca fala com o banco nem com a fonte de leads; o preview
// usa a MESMA interface com dados de mentira (`app/design/campanhas`).

const BASE = "/api/admin/campanhas";

class FalhaDaRota extends Error {
  constructor(
    readonly status: number,
    readonly motivo: string | null,
  ) {
    super(`campanhas: ${status}${motivo ? ` (${motivo})` : ""}`);
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const corpo: unknown = await res.json().catch(() => null);
    const motivo = corpo !== null && typeof corpo === "object" && typeof (corpo as { error?: unknown }).error === "string" ? (corpo as { error: string }).error : null;
    throw new FalhaDaRota(res.status, motivo);
  }
  return res.json() as Promise<T>;
}

const q = (p: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== "") s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : "";
};

const enviar = (corpo: unknown, method = "PUT"): RequestInit => ({ method, body: JSON.stringify(corpo) });

/** A fonte de verdade: uma instância por página (sem estado; cada leitura é uma rota). */
export function fonteDasRotas(): FonteDeCampanhas {
  const acao = async (id: string, a: "iniciar" | "pausar" | "retomar") =>
    (await pedir<{ situacao: SituacaoDaCampanha }>(`/${id}/acao`, enviar({ acao: a }))).situacao;
  return {
    totais: () => pedir<Totais>("/totais"),
    conexoes: () => pedir<ConexaoDisponivel[]>("/conexoes"),
    buscas: (p) => pedir<Pagina<BuscaDaTabela>>(`/buscas${q({ texto: p.texto, situacao: p.situacao, pagina: p.pagina })}`),
    buscasParaEscolher: () => pedir<Busca[]>("/buscas?escolher=1"),
    busca: async (id) => {
      try {
        return await pedir<Busca>(`/buscas/${id}`);
      } catch (e) {
        if (e instanceof FalhaDaRota && e.status === 404) return null;
        throw e;
      }
    },
    novaBusca: async (opcoes) => {
      try {
        await pedir<{ id: string }>("/buscas", enviar({ opcoes }, "POST"));
        return { ok: true };
      } catch (e) {
        if (e instanceof FalhaDaRota && e.status < 500 && e.motivo) return { ok: false, erro: e.motivo };
        throw e;
      }
    },
    leads: (p) =>
      pedir<Pagina<LeadDaTabela>>(
        `/leads${q({ busca: p.buscaId, texto: p.texto, cidade: p.cidade, filtros: p.filtros.join(","), pagina: p.pagina })}`,
      ),
    cidades: (buscaId) => pedir<string[]>(`/leads${q({ cidades: 1, busca: buscaId })}`),
    marcar: async (id, marcacao) => (await pedir<{ marcacao: MarcacaoDoLead }>(`/leads/${id}`, enviar({ marcacao }))).marcacao,
    painelDaBase: (buscaId) => pedir<ResumoDobrado>(`/resumo${q({ busca: buscaId })}`),
    campanhas: (p) => pedir<Pagina<CampanhaDaTabela>>(`${q({ texto: p.texto, situacao: p.situacao, pagina: p.pagina })}`),
    campanhasComEnvio: () => pedir<{ id: string; nome: string }[]>("?com_envio=1"),
    resultados: (p) => pedir<Resultados>(`/resultados${q({ campanha: p.campanhaId, periodo: p.periodo })}`),
    campanha: async (id) => {
      try {
        return await pedir<CampanhaAberta>(`/${id}`);
      } catch (e) {
        if (e instanceof FalhaDaRota && e.status === 404) return null;
        throw e;
      }
    },
    leadsDaCampanha: (id, p) => pedir<Pagina<LeadNaCampanha>>(`/${id}/leads${q({ texto: p.texto, situacao: p.situacao, pagina: p.pagina })}`),
    previaDoFiltro: (f) =>
      pedir<PreviaDoFiltro>(
        `/previa${q({
          busca: f.buscaId,
          bons: f.soMarcadosComoBons ? 1 : null,
          sem_site: f.soSemSiteProprio ? 1 : null,
          origem: f.quemNaoRespondeuDe,
        })}`,
      ),
    salvar: async (c) => {
      const corpo = { nome: c.nome, conexaoId: c.conexaoId, agendadaPara: c.agendadaPara, filtro: c.filtro, passo: c.passo, variantes: c.variantes };
      try {
        return (await pedir<{ salvaEm: number }>(`/${c.id}`, enviar(corpo))).salvaEm;
      } catch (e) {
        // Já começou (outra aba iniciou): o rascunho não muda mais, e não é uma falha a mostrar.
        if (e instanceof FalhaDaRota && e.status === 409) return c.salvaEm;
        throw e;
      }
    },
    iniciar: async (id): Promise<RespostaDeIniciar> => {
      try {
        return { ok: true, situacao: await acao(id, "iniciar") };
      } catch (e) {
        if (e instanceof FalhaDaRota && e.status < 500 && e.motivo) return { ok: false, erro: e.motivo };
        throw e;
      }
    },
    pausar: (id) => acao(id, "pausar"),
    retomar: (id) => acao(id, "retomar"),
  };
}
