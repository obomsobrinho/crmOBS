"use client";

import { usePonteDeContatos } from "@/features/contatos/api/ponte";
import { usePonteDePedidos } from "@/features/pedidos/api/ponte";
import { useSessao } from "@/lib/sessao";

/**
 * AS PONTES DO REALTIME PARA O CACHE (docs/plano-dados-e-estado.md, 2.7), montadas
 * UMA vez, no layout do `(app)`, dentro dos provedores de sessão e de dados.
 *
 * Cada área migrada com tabela no canal do tenant registra aqui a sua ponte. Os
 * canais continuam sendo de `lib/use-canal-ao-vivo.ts` (status, primeira
 * `SUBSCRIBED` pulada, foco, aba escondida); a ponte só diz o que cada evento faz
 * no cache. Numa tela, nunca: uma ponte montada pela tela perderia os eventos
 * que chegam com a pessoa em outra tela.
 *
 * Exceção, a mesma do passo 4 para a conversa aberta: o canal PRÓPRIO de um item
 * aberto (as mensagens de um pedido, `useCanalConversa`) fica no componente que o
 * abre e escreve na chave daquele item.
 */
export default function PonteDoRealtime() {
  const sessao = useSessao();
  usePonteDePedidos(sessao);
  usePonteDeContatos();
  return null;
}
