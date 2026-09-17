import { test, expect } from "@playwright/test";

// Permissões do ATENDENTE, com a sessão gravada por `auth.setup.ts` em
// `e2e/.auth/atendente.json`. Este arquivo fecha os buracos que ficaram
// declarados por escrito em `pipeline.auth.spec.ts` e `montagem.auth.spec.ts`:
// eles não podiam ser escritos com a sessão do dono, porque cada asserção aqui
// afirma uma AUSÊNCIA de poder, e com o dono logado provaria o contrário.
//
// ⚠️ Nada aqui escreve no banco, de propósito: as provas são tela, redirecionamento
// e o status de uma rota que precisa RECUSAR. Um teste de permissão que consegue
// escrever já falhou antes de asserir qualquer coisa.

test.describe("Atendente", () => {
  test("não vê o Agente no menu, e a rota o manda de volta", async ({ page }) => {
    await page.goto("/inbox");
    // O item some do menu para quem não é dono.
    await expect(page.getByRole("link", { name: "Agente" })).toHaveCount(0);

    // E a guarda é de SERVIDOR, não só de menu: entrar pela URL não passa.
    await page.goto("/agente");
    await expect(page).toHaveURL(/\/inbox/);
  });

  test("uma rota dono-only recusa pelo papel", async ({ page }) => {
    // ⚠️ A rota escolhida é `/api/team/invite` e não o `PUT` de `agent-config`,
    // que seria o par óbvio da tela acima. Motivo: o agent-config leva o id do
    // tenant no caminho e responde **403 nos dois casos**, tenant errado e papel
    // errado. Sem o id verdadeiro em mãos, o teste passaria pelo motivo errado, e
    // o id do tenant não aparece em lugar nenhum que o browser veja (a RLS o
    // torna implícito). O invite não leva id, e a checagem de papel vem antes de
    // ler o corpo, então o 403 aqui só pode ser sobre ser atendente.
    const res = await page.request.post("/api/team/invite", {
      data: { email: "nao-deve-ser-convidado@example.com", role: "atendente" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toContain("só o dono");
  });

  test("não gerencia o funil", async ({ page }) => {
    await page.goto("/pipeline");
    // A tela abre: mover card é liberado a qualquer membro do tenant.
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible({
      timeout: 20_000,
    });
    // O que não aparece é a gestão dos estágios, que a RLS de `pipeline_stages`
    // reserva ao dono.
    await expect(
      page.getByRole("button", { name: /Gerenciar est/i })
    ).toHaveCount(0);
  });

  test("a montagem é do dono, e o atendente cai no inbox", async ({ page }) => {
    await page.goto("/montagem");
    await expect(page).toHaveURL(/\/inbox/);
  });
});
