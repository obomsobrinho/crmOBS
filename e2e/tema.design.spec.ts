import { expect, test } from "@playwright/test";

// O produto abre em Light e Dark é opção (decisão do dono, 05/11/2026). O tema
// vem do cookie no servidor, então o teste lê o HTML cru: é ele que evita piscar.
const temaDoHtml = (html: string) => html.match(/<html[^>]*data-theme="(\w+)"/)?.[1];

test("sem cookie o HTML já vem em Light, em tela pública e na casca", async ({ request }) => {
  for (const rota of ["/login", "/cadastro", "/recuperar-senha", "/design"]) {
    const html = await (await request.get(rota)).text();
    expect(temaDoHtml(html), rota).toBe("light");
  }
});

for (const [cookie, esperado] of [
  ["theme=dark", "dark"],
  ["theme=light", "light"],
  ["theme=azul", "light"],
]) {
  test(`com o cookie ${cookie} o HTML vem em ${esperado}`, async ({ request }) => {
    const resposta = await request.get("/login", { headers: { cookie } });
    expect(temaDoHtml(await resposta.text())).toBe(esperado);
  });
}

test("o botão troca nos dois sentidos e a escolha sobrevive à recarga", async ({ page }) => {
  const tema = () => page.evaluate(() => document.documentElement.dataset.theme);

  await page.goto("/design");
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  expect(await tema()).toBe("dark");
  await page.reload();
  expect(await tema()).toBe("dark");

  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  expect(await tema()).toBe("light");
  await page.reload();
  expect(await tema()).toBe("light");
});

test("a moldura do campo só sobe no claro, onde ela é o único sinal", async ({ page }) => {
  const token = (nome: string) =>
    page.evaluate(
      (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
      nome,
    );

  await page.goto("/login");
  expect(await token("--input-line")).toBe(await token("--line-strong"));

  await page.context().addCookies([{ name: "theme", value: "dark", url: "http://localhost" }]);
  await page.reload();
  expect(await token("--input-line")).toBe(await token("--line"));
});
