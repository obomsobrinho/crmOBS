// O ATENDENTE DE TESTE é opcional desde 07/11/2026 (decisão do dono): o usuário de
// 17/09/2026 saiu do tenant OBS, e a suíte com login roda só com a conta do dono
// (`E2E_EMAIL`). Sem `E2E_ATTENDANT_EMAIL` e `E2E_ATTENDANT_PASSWORD` no
// `.env.e2e.local`, o setup não grava a sessão do atendente e os testes que
// precisam do PAPEL de atendente pulam com este motivo, em vez de falhar.
// Voltar a provar as permissões é só colocar as duas variáveis de novo (um
// usuário `atendente` no tenant OBS, em `user_clients`).

export const TEM_ATENDENTE = Boolean(process.env.E2E_ATTENDANT_EMAIL && process.env.E2E_ATTENDANT_PASSWORD);

export const SEM_ATENDENTE =
  "Sem atendente de teste (E2E_ATTENDANT_EMAIL e E2E_ATTENDANT_PASSWORD fora do .env.e2e.local): a suíte usa só a conta do dono, e as permissões do papel atendente não são provadas nesta execução.";
