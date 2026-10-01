import type { Json } from "@/lib/database.types";

/**
 * Entrega um objeto de domínio (interface, sem index signature) a uma coluna
 * jsonb tipada como `Json`. O TypeScript não prova que uma interface é JSON, mas
 * estes objetos são montados só de string, número, booleano, array e objeto
 * simples: nada de Date, função ou undefined no meio. É o ÚNICO lugar com esse
 * cast, para ele não se espalhar pelas rotas.  (why: docs/adr/2026-10-02-generated-supabase-types.md)
 */
export function paraJson(valor: object): Json {
  return valor as Json;
}
