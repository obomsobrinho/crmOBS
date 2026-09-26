import { test as setup } from "@playwright/test";
import { semearConversa, servico, tenantDeTeste } from "./semente";

// Antes da suíte com login: garante a conversa de teste no tenant de teste, em
// estado limpo. É ela que tira do "pula" os testes que precisam de conversa
// (pipeline, marcar como lida) e que os testes de handoff e orientação usam.
// Ver `e2e/semente.ts`, que diz o que é gravado e como limpar.
setup("semear a conversa de teste", async () => {
  const svc = servico();
  const { clientId } = await tenantDeTeste(svc);
  await semearConversa(svc, clientId);
});
