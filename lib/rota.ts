import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getMyClient, type MyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  /**
   * Reconfere a sessão NO AUTH (`getUser()`, uma ida à rede) antes de seguir.
   * O padrão confere o JWT só localmente (`getClaims()`, R-08): um usuário
   * revogado ainda passa até o token vencer. Rota que ESCREVE algo sensível
   * (convidar ou remover membro, publicar, assinatura, config do agente, avisos)
   * liga isto e fecha a janela.
   */
  revalidar?: boolean;
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
  if (exige.revalidar) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { erro: NextResponse.json({ error: "não autenticado" }, { status: 401 }) };
    }
  }
  const mine = await getMyClient();
  if (!mine) {
    return { erro: NextResponse.json({ error: "não autenticado" }, { status: 401 }) };
  }
  // Conta DESATIVADA pelo dono do produto (central "Clientes"): nenhuma rota de
  // sessão trabalha, leitura inclusive (o login inteiro está barrado; a tela é
  // `/conta-desativada`). Vem antes de tudo o mais, como a sessão.
  if (mine.contaDesativada) {
    return { erro: NextResponse.json({ error: "conta desativada" }, { status: 403 }) };
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

/**
 * O formato único de erro das rotas que o app chama (docs/plano-dados-e-estado.md,
 * 2.9): status HTTP mais `{ error, codigo? }`. `error` é a frase que a tela mostra
 * (português), `codigo` é o motivo para a máquina (`nao_encontrado`, `entrada_invalida`).
 * Rota de webhook continua respondendo o que o chamador espera.
 */
export function erroDaRota(status: number, frase: string, codigo?: string): NextResponse {
  return NextResponse.json(codigo ? { error: frase, codigo } : { error: frase }, { status });
}

/** A frase de entrada recusada. O detalhe vai para o log, não para a tela. */
const FRASE_ENTRADA_INVALIDA = "Os dados enviados não estão no formato esperado.";

/**
 * Lê o corpo JSON da requisição pelo esquema Zod da área (2.9). O tipo vem do
 * esquema. Falhou: `{ erro }` pronto (400, `entrada_invalida`), que a rota só
 * repassa, como em `sessaoDaRota`.
 */
export async function lerCorpo<S extends z.ZodType>(
  req: Request,
  esquema: S
): Promise<{ dados: z.infer<S> } | { erro: NextResponse }> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return { erro: erroDaRota(400, FRASE_ENTRADA_INVALIDA, "entrada_invalida") };
  }
  return validar(esquema, bruto, new URL(req.url).pathname);
}

/** O mesmo para a query string (`?x=...`), lida como objeto de textos. */
export function lerConsulta<S extends z.ZodType>(
  req: Request,
  esquema: S
): { dados: z.infer<S> } | { erro: NextResponse } {
  const url = new URL(req.url);
  return validar(esquema, Object.fromEntries(url.searchParams), url.pathname);
}

function validar<S extends z.ZodType>(
  esquema: S,
  bruto: unknown,
  onde: string
): { dados: z.infer<S> } | { erro: NextResponse } {
  const r = esquema.safeParse(bruto);
  if (r.success) return { dados: r.data };
  console.warn("entrada recusada:", onde, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return { erro: erroDaRota(400, FRASE_ENTRADA_INVALIDA, "entrada_invalida") };
}

/**
 * Modo sombra para chamador de máquina (Asaas, Apify, crons; 2.9): confere o corpo
 * pelo esquema e REGISTRA a diferença, sem recusar nada. Só depois de uma semana
 * sem diferença a rota passa a usar `lerCorpo`. Devolve se bateu, para a contagem.
 */
export function conferirNaSombra(esquema: z.ZodType, bruto: unknown, onde: string): boolean {
  const r = esquema.safeParse(bruto);
  if (!r.success) {
    console.warn(
      "[sombra] entrada fora do esquema:",
      onde,
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }
  return r.success;
}
