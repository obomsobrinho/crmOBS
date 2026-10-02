import { test, expect } from "@playwright/test";

// O link de e-mail no FLUXO IMPLÍCITO (25/09/2026). O modelo padrão do Supabase
// manda a sessão depois do `#`, e `/auth/confirm` roda no servidor, onde o `#`
// nunca chega. Até esta data o convidado do cadastro caía no LOGIN em vez de
// criar a senha. Agora `/auth/confirm` passa para `/auth/concluir`, que lê o
// `#` no navegador.
//
// ⚠️ O caminho de SUCESSO não está aqui: exige um token de verdade, que só sai
// do Supabase com a chave de serviço. Ele foi provado à mão em 25/09/2026, com
// `auth.admin.generateLink` numa conta de teste: o link caiu em `/definir-senha`.
// Aqui fica o que dá para provar sem sessão: o `#` atravessa o
// redirecionamento, token inválido volta ao login, e o token some do endereço.

test("o # do link atravessa o /auth/confirm e o token some do endereço", async ({
  page,
}) => {
  await page.goto(
    "/auth/confirm?next=/definir-senha#access_token=falso&refresh_token=falso&type=invite"
  );
  await page.waitForURL("**/login?erro=convite", { timeout: 20_000 });
  // O token é uma sessão válida quando é de verdade: não pode ficar no endereço
  // nem no histórico.
  expect(new URL(page.url()).hash).toBe("");
});

test("link sem sessão nenhuma volta ao login", async ({ page }) => {
  await page.goto("/auth/confirm?next=/definir-senha");
  await page.waitForURL("**/login?erro=convite", { timeout: 20_000 });
});

test("o login diz que o link venceu, e aponta para uma senha nova", async ({
  page,
}) => {
  // Sem este aviso quem abria um link já usado via só "Entrar" e não sabia o
  // que fazer (aconteceu com o dono duas vezes em 25/09/2026).
  await page.goto("/login?erro=convite");
  const aviso = page.locator('[data-slot="aviso-link"]');
  await expect(aviso).toContainText("expirou ou já foi usado");
  await expect(
    aviso.getByRole("link", { name: "Receber um link novo para criar a senha" })
  ).toHaveAttribute("href", "/recuperar-senha?modo=criar");
  // Quem foi convidado e nunca criou senha não "esqueceu" nada (02/10/2026).
  await page.goto("/recuperar-senha?modo=criar");
  await expect(page.getByRole("heading", { name: "Criar sua senha" })).toBeVisible();

  await page.goto("/login");
  await expect(page.locator('[data-slot="aviso-link"]')).toHaveCount(0);
});
