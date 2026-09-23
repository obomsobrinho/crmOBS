import "server-only";

/**
 * A chave geral do beta: `BETA_ABERTO=1` (ou `true`) no ambiente libera o
 * acesso de TODO tenant, sem olhar teste nem assinatura (ver `accessState` em
 * `lib/billing.ts`). Desligar é tirar a variável e redeployar.
 *
 * ⚠️ Ao desligar, quem se cadastrou durante o beta volta a ser julgado pelo
 * `trial_ends_at` que o cadastro gravou (7 dias depois da criação), ou seja, já
 * vencido: a conta cai direto na tela de bloqueio. Antes de desligar, decidir o
 * que fazer com essas contas (dar um teste novo, marcar como interna, cobrar).
 */
export function betaAberto(): boolean {
  const v = process.env.BETA_ABERTO?.trim().toLowerCase();
  return v === "1" || v === "true";
}
