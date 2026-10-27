import { test, expect } from "@playwright/test";
import { SEM_PEDIDOS, textoDosPedidosAbertos } from "../lib/admin-alertas";

// CENTRAL: PEDIDOS DE AJUDA ABERTOS POR CLIENTE (27/10/2026, dono). Um ícone ao
// lado do nome quando a empresa tem pedido de ajuda (`handoffs`) sem fechar, com
// quantos e há quanto tempo o mais antigo espera. Regra: UM aberto já mostra.
// A regra é pura (lib/admin-alertas.ts); a tela roda no preview /design/clientes,
// com dados falsos (Barbearia do Zé: 7 e 5 dias; Ateliê Lumière: 1 e 3 horas).
// A contagem de verdade é `admin_pedidos_abertos` (SQL, uma chamada por página).

const AGORA = Date.parse("2026-10-27T15:00:00Z");
const ha = (ms: number) => new Date(AGORA - ms).toISOString();
const H = 3_600_000;

test.describe("Regra do ícone de pedidos abertos (lib/admin-alertas.ts)", () => {
  test("nenhum aberto: sem ícone; um já mostra", () => {
    expect(textoDosPedidosAbertos(SEM_PEDIDOS, AGORA)).toBeNull();
    expect(textoDosPedidosAbertos({ abertos: 0, maisAntigo: ha(H) }, AGORA)).toBeNull();
    expect(textoDosPedidosAbertos({ abertos: 1, maisAntigo: ha(3 * H) }, AGORA)).toBe(
      "1 pedido de ajuda aberto há 3 horas"
    );
  });

  test("vários: quantos e há quanto tempo o mais antigo espera", () => {
    expect(textoDosPedidosAbertos({ abertos: 7, maisAntigo: ha(5 * 24 * H + 2 * H) }, AGORA)).toBe(
      "7 pedidos de ajuda abertos · o mais antigo há 5 dias"
    );
    expect(textoDosPedidosAbertos({ abertos: 2, maisAntigo: ha(24 * H) }, AGORA)).toBe(
      "2 pedidos de ajuda abertos · o mais antigo há 1 dia"
    );
    expect(textoDosPedidosAbertos({ abertos: 2, maisAntigo: ha(H) }, AGORA)).toBe(
      "2 pedidos de ajuda abertos · o mais antigo há 1 hora"
    );
    expect(textoDosPedidosAbertos({ abertos: 3, maisAntigo: ha(10 * 60_000) }, AGORA)).toBe(
      "3 pedidos de ajuda abertos · o mais antigo há menos de 1 hora"
    );
    // Sem data (não deveria acontecer): só a contagem, nunca uma idade inventada.
    expect(textoDosPedidosAbertos({ abertos: 4, maisAntigo: null }, AGORA)).toBe("4 pedidos de ajuda abertos");
  });
});

test.describe("Ícone na lista da central (/design/clientes)", () => {
  test("aparece só em quem tem pedido aberto, e o balão diz o quê", async ({ page }) => {
    await page.goto("/design/clientes");
    const icones = page.locator('[data-slot="central-pedidos"]');
    await expect(icones).toHaveCount(2);

    const barbearia = page.locator('[data-slot="central-cliente"]', { hasText: "Barbearia do Zé" });
    const icone = barbearia.locator('[data-slot="central-pedidos"]');
    await expect(icone).toHaveAttribute("aria-label", "7 pedidos de ajuda abertos · o mais antigo há 5 dias");
    await icone.scrollIntoViewIfNeeded();
    // A lista chega no HTML do servidor antes da hidratação: um hover cedo demais
    // não abre o balão (o Radix ainda não ouve). Repete o gesto até abrir.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await icone.hover();
      await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
        "7 pedidos de ajuda abertos · o mais antigo há 5 dias",
        { timeout: 1500 }
      );
    }).toPass({ timeout: 15_000 });

    // Quem não tem pedido aberto não tem ícone.
    const semPedido = page.locator('[data-slot="central-cliente"]', { hasText: "Cliente de exemplo 01" });
    await expect(semPedido.locator('[data-slot="central-pedidos"]')).toHaveCount(0);
  });
});
