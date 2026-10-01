import { test, expect } from "@playwright/test";
import { decisaoDaFoto, origemDaFoto, precisaConferir, urlDaFoto } from "../lib/fotos";

// FOTO DE PERFIL (F4, 01/10/2026): a regra pura (lib/fotos.ts) e o avatar com
// foto no preview de Clientes. A foto é servida por /api/fotos, que no preview
// (sem sessão) responde 401; o teste serve uma imagem pela rede falsa.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Regra da foto (lib/fotos.ts)", () => {
  test("o link muda de assinatura a cada consulta, e isso não é foto nova", () => {
    const a = "https://pps.whatsapp.net/v/t61.24694-24/123_n.jpg?ccb=11-4&oh=AAA&oe=66F0";
    const b = "https://pps.whatsapp.net/v/t61.24694-24/123_n.jpg?ccb=11-4&oh=BBB&oe=6700";
    expect(origemDaFoto(a)).toBe(origemDaFoto(b));
    expect(decisaoDaFoto({ fotoPath: "t/fotos/1-x.jpg", fotoOrigem: origemDaFoto(a) }, b)).toBe("manter");
    expect(decisaoDaFoto({ fotoPath: "t/fotos/1-x.jpg", fotoOrigem: origemDaFoto(a) }, "https://pps.whatsapp.net/v/t61/999_n.jpg?x=1")).toBe("baixar");
    expect(decisaoDaFoto({ fotoPath: null, fotoOrigem: null }, a)).toBe("baixar");
  });

  test("quem esconde a foto fica sem foto; sem foto e sem link, nada a fazer", () => {
    expect(decisaoDaFoto({ fotoPath: "t/fotos/1-x.jpg", fotoOrigem: "h/p" }, null)).toBe("apagar");
    expect(decisaoDaFoto({ fotoPath: null, fotoOrigem: null }, null)).toBe("manter");
  });

  test("confere a cada 7 dias", () => {
    const agora = Date.parse("2026-10-01T12:00:00Z");
    expect(precisaConferir(null, agora)).toBe(true);
    expect(precisaConferir("2026-09-25T12:00:00Z", agora)).toBe(false);
    expect(precisaConferir("2026-09-24T12:00:00Z", agora)).toBe(true);
  });

  test("o endereço servido pelo app", () => {
    expect(urlDaFoto("abc/fotos/2-ff.jpg")).toBe("/api/fotos/abc/fotos/2-ff.jpg");
    expect(urlDaFoto(null)).toBeNull();
  });
});

test.describe("Avatar com foto (/design/clientes)", () => {
  test("com foto mostra a imagem na lista e na ficha; sem foto, as iniciais", async ({ page }) => {
    await page.route("**/api/fotos/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    await page.goto("/design/clientes?sel=2");
    const linha = page.locator('[data-slot="clientes-item"]', { hasText: "Marina Souza" });
    await expect(linha.locator('[data-slot="avatar-image"]')).toBeVisible();
    await expect(page.locator('main [data-slot="avatar-image"], [data-slot="avatar"][data-foto] img').last()).toBeVisible();
    const outra = page.locator('[data-slot="clientes-item"]', { hasText: "Helena Castro" });
    await expect(outra.locator('[data-slot="avatar"]')).toHaveText("HC");
  });

  test("foto que não carrega cai nas iniciais", async ({ page }) => {
    await page.route("**/api/fotos/**", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/design/clientes");
    const linha = page.locator('[data-slot="clientes-item"]', { hasText: "Marina Souza" });
    await expect(linha.locator('[data-slot="avatar"]')).toHaveText("MS");
    await expect(linha.locator('[data-slot="avatar-image"]')).toHaveCount(0);
  });
});
