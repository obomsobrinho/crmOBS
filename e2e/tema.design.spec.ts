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

test("quem escolheu Dark continua em Dark desde o HTML", async ({ request }) => {
  const resposta = await request.get("/login", { headers: { cookie: "theme=dark" } });
  expect(temaDoHtml(await resposta.text())).toBe("dark");
});

test("cookie desconhecido cai no padrão Light", async ({ request }) => {
  const resposta = await request.get("/login", { headers: { cookie: "theme=azul" } });
  expect(temaDoHtml(await resposta.text())).toBe("light");
});

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

test("a moldura do campo é mais forte no claro, onde ela é o único sinal", async ({ page }) => {
  const token = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--input-line").trim(),
    );
  const forte = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--line-strong").trim(),
    );

  await page.goto("/login");
  expect(await token()).toBe(await forte());

  await page.context().addCookies([{ name: "theme", value: "dark", url: "http://localhost" }]);
  await page.reload();
  expect(await token()).not.toBe(await forte());
});
