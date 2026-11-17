import { campo, corpoJson } from "@/lib/esquema";

// O CORPO DA ROTA QUE CADASTRA UM CONTATO (`POST /api/contacts`; docs/plano-dados-e-estado.md,
// 2.9, varredura do passo 5). O telefone, o e-mail e a data são conferidos no handler, que
// responde com o `campo` do erro para a tela marcar o campo; o esquema decide só o JSON.

export const corpoDoNovoContato = corpoJson(
  { telefone: campo<unknown>(), nome: campo<unknown>(), email: campo<unknown>(), nascimento: campo<unknown>() },
  "JSON inválido",
);
