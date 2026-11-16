import { z } from "zod";
import { corpoJson, textoAparado } from "./esquema";

// OS CORPOS DAS ROTAS DE EQUIPE (`POST /api/team/invite` e `/remove`), com as frases
// que as rotas já diziam (docs/plano-dados-e-estado.md, 2.9; varredura do passo 5).
// Equipe ainda não mudou para `features/`, então o esquema mora ao lado de `lib/team.ts`.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const corpoDoConvite = corpoJson(
  {
    email: textoAparado.transform((v) => v.toLowerCase()).refine((v) => EMAIL_RE.test(v), "e-mail inválido"),
    role: z.unknown().refine((v): v is "dono" | "atendente" => v === "dono" || v === "atendente", "papel inválido"),
  },
  "JSON inválido",
).transform((c) => ({ email: c.email, role: c.role as "dono" | "atendente" }));

export const corpoDoRemover = corpoJson(
  { userId: textoAparado.refine(Boolean, "userId é obrigatório") },
  "JSON inválido",
);
