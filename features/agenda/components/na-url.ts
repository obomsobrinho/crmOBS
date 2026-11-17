"use client";

import { createParser, useQueryState } from "nuqs";

// A SEMANA DA AGENDA NA URL (passo 3b de docs/plano-dados-e-estado.md, 2.8): um dia da
// semana exibida (`?semana=AAAA-MM-DD`, a tela usa a segunda dela); refresh e voltar
// mantêm. Trocar de semana substitui a entrada do histórico. Valor torto na URL vale
// "esta semana" (o leitor só aceita uma data no formato).
const parametroDeDia = createParser({
  parse: (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null),
  serialize: (v: string) => v,
});

export function useSemanaNaUrl() {
  return useQueryState("semana", parametroDeDia);
}
