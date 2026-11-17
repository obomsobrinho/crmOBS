import { z } from "zod";

// O CORPO DE `POST /api/signup` (docs/plano-dados-e-estado.md, 2.9; varredura do passo 5).
// A rota é pública e sem sessão: o esquema entra em MODO SOMBRA (`conferirNaSombra`, só
// registra o que fugir dele, nunca recusa), e a rota decide exatamente como antes. Passar
// a recusar é decisão do dono depois de uma semana sem diferença. Só os dois campos que a
// rota lê; campo a mais não é diferença.
export const corpoDoCadastro = z.object({
  companyName: z.string().optional(),
  email: z.string().optional(),
});
