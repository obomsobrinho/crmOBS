import type { Database } from "@/lib/database.types";

// O schema que os clients usam: `Database` (gerado, nunca editado à mão) com UM
// ajuste, nos argumentos das funções SQL. O gerador marca todo argumento como
// "string" ou "string | undefined", mas o banco aceita NULL em qualquer um (os
// que têm DEFAULT NULL, e `p_coluna` de `pipeline_coluna`, que a busca de um
// card passa nulo de propósito). O código sempre mandou `null`, então o tipo
// passa a dizer o que o banco aceita. O retorno das funções segue como gerado.
// (why: docs/adr/2026-10-02-generated-supabase-types.md)
type Funcoes = Database["public"]["Functions"];

type ArgsAnulaveis<T> = { [K in keyof T]: T[K] | null };

export type DatabaseApp = {
  [S in keyof Database]: S extends "public"
    ? Omit<Database["public"], "Functions"> & {
        Functions: {
          [F in keyof Funcoes]: Omit<Funcoes[F], "Args"> & {
            Args: ArgsAnulaveis<Funcoes[F]["Args"]>;
          };
        };
      }
    : Database[S];
};

type LinhaDe<F extends keyof Funcoes> = Funcoes[F]["Returns"] extends (infer R)[] ? R : never;

/**
 * Linha de uma função SQL que devolve tabela. O gerador tipa toda coluna de
 * retorno como não nula; `Nulos` lista as que o SQL pode devolver nulas, para o
 * tipo dizer a verdade sem cast no ponto de uso.
 */
export type LinhaRpc<F extends keyof Funcoes, Nulos extends keyof LinhaDe<F> = never> = Omit<
  LinhaDe<F>,
  Nulos
> & { [K in Nulos]: LinhaDe<F>[K] | null };

/** Os argumentos de uma função SQL, menos os que o chamador já fixa (`Fixos`). */
export type ArgsRpc<F extends keyof Funcoes, Fixos extends keyof Funcoes[F]["Args"] = never> = Omit<
  ArgsAnulaveis<Funcoes[F]["Args"]>,
  Fixos
>;
