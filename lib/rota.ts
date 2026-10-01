import "server-only";
import { NextResponse } from "next/server";
import { getMyClient, type MyClient } from "@/lib/auth";

/**
 * O que a rota exige de quem chama. Tudo opcional: o piso, sempre aplicado, é
 * ter sessão (401).
 */
export interface Exigencias {
  /** Id do tenant que vem na URL. Diferente do tenant do usuário: 403 "acesso negado". */
  id?: string;
  /** Exige papel `dono`. O texto é o do 403, que cada rota diz na sua língua. */
  dono?: string;
  /**
   * Conta bloqueada (`access.blocked`) responde 402 com a mensagem do
   * `accessState`. Só rota que é TRABALHO liga isto: conta bloqueada fica em
   * modo leitura, e as rotas de leitura seguem abertas.
   */
  ativa?: boolean;
}

/**
 * ÚNICO lugar onde uma rota de sessão resolve quem chama (R-40, 01/10/2026).
 * Antes eram 19 handlers com o mesmo bloco de 401, 403 e dono copiado à mão, e
 * o gate de assinatura ficou de fora de dois deles justamente por ser copiado.
 *
 * Devolve `{ mine }` pronto ou `{ erro }`, uma `NextResponse` que a rota só
 * repassa: `if ("erro" in r) return r.erro;`. A ordem das checagens é fixa
 * (sessão, tenant, papel, assinatura), e é a que as rotas já tinham.
 *
 * Rota nova com sessão do usuário usa isto. Rota protegida por segredo
 * (`x-lookup-secret`, webhook) é outro caso e não passa por aqui.
 */
export async function sessaoDaRota(
  exige: Exigencias = {}
): Promise<{ mine: MyClient } | { erro: NextResponse }> {
  const mine = await getMyClient();
  if (!mine) {
    return { erro: NextResponse.json({ error: "não autenticado" }, { status: 401 }) };
  }
  if (exige.id !== undefined && mine.id !== exige.id) {
    return { erro: NextResponse.json({ error: "acesso negado" }, { status: 403 }) };
  }
  if (exige.dono !== undefined && mine.role !== "dono") {
    return { erro: NextResponse.json({ error: exige.dono }, { status: 403 }) };
  }
  if (exige.ativa && mine.access.blocked) {
    return { erro: NextResponse.json({ error: mine.access.message }, { status: 402 }) };
  }
  return { mine };
}
