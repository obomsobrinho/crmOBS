"use client";

import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { parametroDeBusca } from "@/lib/url";
import { ehMotivo } from "@/lib/motivos";

// A TELA DE PEDIDOS NA URL (passo 3a de docs/plano-dados-e-estado.md, 2.8): a aba, a
// busca, o motivo e o pedido aberto ficam no endereço, então recarregar e voltar
// mantêm onde a pessoa estava. `?abrir=` já era o link do aviso no WhatsApp e
// continua o mesmo. Abrir um pedido ou trocar de aba cria entrada no histórico;
// a busca e o motivo substituem. Modo raso: nada disso vai ao servidor.
//
// A aba sem `?aba=` é decidida pela tela (o pedido do link resolvido abre em
// Resolvidos, como antes), por isso o leitor dela não tem padrão.

const ABAS = ["abertos", "resolvidos"] as const;

export const PARAMETROS_DE_PEDIDOS = {
  aba: parseAsStringLiteral(ABAS),
  q: parametroDeBusca,
  motivo: parseAsString,
  abrir: parseAsInteger,
};

export function usePedidosNaUrl() {
  const [u, setU] = useQueryStates(PARAMETROS_DE_PEDIDOS);
  // Motivo desconhecido na URL (editada à mão, chave antiga) vale "todos".
  const motivo = u.motivo && ehMotivo(u.motivo) ? u.motivo : null;
  const abrir = u.abrir != null && u.abrir > 0 ? u.abrir : null;
  return { aba: u.aba, q: u.q, motivo, abrir, setU };
}
