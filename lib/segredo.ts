import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara um segredo recebido num header com o esperado, em tempo constante
 * (R-31, 01/10/2026). `!==` para na primeira diferença, e o tempo de resposta
 * vira dica de quantos caracteres batem.
 *
 * Os dois lados passam por SHA-256 antes: `timingSafeEqual` exige tamanhos
 * iguais, e comparar o tamanho direto vazaria o tamanho do segredo. Sem
 * segredo configurado (ou sem header) nunca confere, para uma variável de
 * ambiente esquecida não abrir a rota.
 */
export function segredoConfere(
  recebido: string | null | undefined,
  esperado: string | null | undefined
): boolean {
  if (!esperado || !recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
