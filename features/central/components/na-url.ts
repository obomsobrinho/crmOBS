"use client";

import { createParser, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { parametroDeBusca } from "@/lib/url";
import { FILTROS_DE_SITUACAO } from "@/lib/admin-alertas";
import { ABAS_DO_CLIENTE, type SelecaoDeUso } from "@/lib/admin-cliente";
import { ORDEM_PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/periodo";

// A CENTRAL NA URL (passo 5 de docs/plano-dados-e-estado.md, 2.8): recarregar, voltar e
// um link compartilhado abrem a mesma visão. Lista: `?q=` e `?situacao=` (substituem a
// entrada do histórico). Detalhe: `?aba=` (substitui também: com "empilhar", voltar depois de um
// recarregar mostrava a aba errada, o nuqs não relia a URL restaurada; testado em 16/11/2026),
// `?uso=` (o filtro da aba Uso de IA) e `?atendimento=` (o período da aba Atendimento), que
// substituem. Voltar sai do cliente para a lista, como antes. Valor torto na URL cai no padrão (o nuqs faz isso; sem Zod aqui).

const SITUACOES = FILTROS_DE_SITUACAO.map((f) => f.chave);

export function useListaNaUrl() {
  const [u, setU] = useQueryStates({ q: parametroDeBusca, situacao: parseAsStringLiteral(SITUACOES) });
  return { q: u.q, situacao: u.situacao, setU };
}

export function useAbaNaUrl() {
  return useQueryState("aba", parseAsStringLiteral(ABAS_DO_CLIENTE).withDefault("visao"));
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function ehPeriodo(v: string): v is PeriodoKey {
  return (ORDEM_PERIODOS as readonly string[]).includes(v);
}

const USO_PADRAO: SelecaoDeUso = { tipo: "periodo", periodo: PERIODO_PADRAO };

/** O filtro da aba Uso de IA: um chip (`dia`...), um mês (`2026-10`), `tudo` ou um intervalo (`2026-10-01_2026-10-20`). */
export const parametroDoUso = createParser<SelecaoDeUso>({
  parse: (v) => {
    if (ehPeriodo(v)) return { tipo: "periodo", periodo: v };
    if (v === "tudo") return { tipo: "tudo" };
    if (MES.test(v)) return { tipo: "mes", mes: v };
    const [de, ate, resto] = v.split("_");
    if (resto === undefined && de && ate && DIA.test(de) && DIA.test(ate)) return { tipo: "intervalo", de, ate };
    return null;
  },
  serialize: (s) =>
    s.tipo === "periodo" ? s.periodo : s.tipo === "mes" ? s.mes : s.tipo === "tudo" ? "tudo" : `${s.de}_${s.ate}`,
  eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
}).withDefault(USO_PADRAO);

export function useUsoNaUrl() {
  return useQueryState("uso", parametroDoUso);
}

export function useAtendimentoNaUrl() {
  return useQueryState("atendimento", parseAsStringLiteral(ORDEM_PERIODOS).withDefault(PERIODO_PADRAO));
}
