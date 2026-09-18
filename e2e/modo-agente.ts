import { expect, type Page } from "@playwright/test";

// Em que modo o `/agente` abriu. NÃO é um spec: é helper, e por isso o nome não
// termina em `.spec.ts` (nenhum `testMatch` do playwright.config.ts o pega).
//
// ⚠️ O tenant de teste pode estar em QUALQUER um dos dois modos, e a tela é
// outra em cada um: o guiado mostra as três abas, o avançado mostra um campo de
// texto só. Os testes travavam a forma guiada e quebraram no dia em que o tenant
// de teste virou a OBS, que escreve o prompt à mão. Nenhum teste pode assumir o
// modo; quem precisa saber, pergunta aqui.
//
// ⚠️ Esperar o interruptor de modo ANTES de decidir qual caminho seguir. A tela é
// client component e demora a hidratar; um `isVisible()` cru responde "não" para
// um botão que aparece dois segundos depois. É essa espera que mora aqui dentro,
// e é o motivo de o helper existir em vez de duas cópias do bloco.

/** Botão que leva ao formulário guiado. Só aparece quando a tela está no avançado. */
export const botaoParaGuiado = (page: Page) =>
  page.getByRole("button", { name: "Voltar ao formulário guiado" });

/** Botão que leva ao modo avançado. Só aparece quando a tela está no guiado. */
export const botaoParaAvancado = (page: Page) =>
  page.getByRole("button", { name: "Escrever o prompt à mão" });

export async function modoDoAgente(page: Page): Promise<"guiado" | "avancado"> {
  const paraGuiado = botaoParaGuiado(page);
  await expect(paraGuiado.or(botaoParaAvancado(page))).toBeVisible();
  return (await paraGuiado.isVisible()) ? "avancado" : "guiado";
}
