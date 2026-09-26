import { test, expect, type Page } from "@playwright/test";

// A bancada de teste como CONVERSA (26/09/2026, pedido do dono): "digitando…"
// enquanto o agente pensa, um balão por mensagem como no WhatsApp, e mensagem
// de voz. Mora no passo Testar da montagem, que é a primeira impressão do
// produto.
//
// As respostas do agente e da transcrição são FALSAS (`page.route`): o que se
// prova aqui é a tela, não o cérebro. O cérebro tem a suíte `ia`, e a
// transcrição usa o mesmo modelo do nó "Whisper" do n8n.
//
// O microfone é o falso do Chromium (`--use-fake-device-for-media-stream`), que
// grava um bipe; `--use-fake-ui-for-media-stream` aceita a permissão sozinho.
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

const RESPOSTA = {
  output: {
    messages: ["Oi! Aqui é a Bia, da Ótica Vision.", "Como posso te ajudar hoje?"],
    action: "none",
    summary: "",
    preferencia_horario: "",
  },
  diagnostics: {},
};

async function agenteFalso(page: Page, atrasoMs: number) {
  await page.route("**/api/playground", async (rota) => {
    await new Promise((r) => setTimeout(r, atrasoMs));
    await rota.fulfill({ json: RESPOSTA });
  });
}

test("digitando enquanto pensa, e um balão por mensagem", async ({ page }) => {
  await agenteFalso(page, 1200);
  await page.goto("/design/montagem?passo=testar");
  await page.waitForLoadState("networkidle");
  const bancada = page.locator('[data-slot="montagem-bancada"]');

  await bancada.getByRole("textbox").fill("oi, vocês abrem sábado?");
  await bancada.getByRole("button", { name: "Enviar", exact: true }).click();

  // Antes da resposta: os três pontos, e nenhum balão do agente.
  await expect(bancada.locator('[data-slot="digitando"]')).toBeVisible();
  await expect(bancada.getByText("Oi! Aqui é a Bia")).toHaveCount(0);

  // Dois itens em `messages` viram DOIS balões, e o segundo chega depois.
  await expect(bancada.getByText("Oi! Aqui é a Bia, da Ótica Vision.")).toBeVisible();
  await expect(bancada.getByText("Como posso te ajudar hoje?")).toBeVisible({
    timeout: 5_000,
  });
  await expect(bancada.locator('[data-slot="digitando"]')).toHaveCount(0);
});

test("campo vazio mostra o microfone; com texto vira enviar", async ({ page }) => {
  await page.goto("/design/montagem?passo=testar");
  await page.waitForLoadState("networkidle");
  const bancada = page.locator('[data-slot="montagem-bancada"]');
  await expect(bancada.getByRole("button", { name: "Gravar áudio" })).toBeVisible();
  await bancada.getByRole("textbox").fill("oi");
  await expect(bancada.getByRole("button", { name: "Gravar áudio" })).toHaveCount(0);
  await expect(bancada.getByRole("button", { name: "Enviar", exact: true })).toBeVisible();
});

test("áudio: grava, mostra a transcrição, e o agente responde", async ({
  page,
}) => {
  let transcreveu = 0;
  await page.route("**/api/playground/transcrever", async (rota) => {
    transcreveu++;
    await rota.fulfill({ json: { texto: "vocês abrem no sábado?" } });
  });
  // O agente recebe o TEXTO transcrito, como no WhatsApp.
  let mensagemAoAgente = "";
  await page.route("**/api/playground", async (rota) => {
    mensagemAoAgente = (rota.request().postDataJSON() as { message: string }).message;
    await rota.fulfill({ json: RESPOSTA });
  });

  await page.goto("/design/montagem?passo=testar");
  await page.waitForLoadState("networkidle");
  const bancada = page.locator('[data-slot="montagem-bancada"]');

  await bancada.getByRole("button", { name: "Gravar áudio" }).click();
  await expect(bancada.locator('[data-slot="gravando"]')).toContainText("Gravando 0:0");
  await page.waitForTimeout(1_500);
  await bancada.getByRole("button", { name: "Enviar áudio" }).click();

  await expect(bancada.locator('[data-slot="balao-audio"]')).toBeVisible();
  await expect(bancada.locator('[data-slot="transcricao"]')).toHaveText(
    "Transcrição: “vocês abrem no sábado?”"
  );
  await expect(bancada.getByText("Como posso te ajudar hoje?")).toBeVisible({
    timeout: 5_000,
  });
  expect(transcreveu).toBe(1);
  expect(mensagemAoAgente).toBe("vocês abrem no sábado?");
});

test("descartar a gravação não manda nada", async ({ page }) => {
  let chamadas = 0;
  await page.route("**/api/playground/**", async (rota) => {
    chamadas++;
    await rota.fulfill({ json: {} });
  });
  await page.goto("/design/montagem?passo=testar");
  await page.waitForLoadState("networkidle");
  const bancada = page.locator('[data-slot="montagem-bancada"]');
  await bancada.getByRole("button", { name: "Gravar áudio" }).click();
  await expect(bancada.locator('[data-slot="gravando"]')).toBeVisible();
  await bancada.getByRole("button", { name: "Descartar áudio" }).click();
  await expect(bancada.getByRole("button", { name: "Gravar áudio" })).toBeVisible();
  await expect(bancada.locator('[data-slot="balao-audio"]')).toHaveCount(0);
  expect(chamadas).toBe(0);
});

test("o passo de conversa não rola a página, em 375 e em 1440", async ({ page }) => {
  // Pedido do dono (26/09/2026): quem rola é só a conversa por dentro. A
  // página inteira cabe na tela, com o rodapé e a caixa de escrita à vista.
  for (const [w, h] of [
    [375, 667],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/design/montagem?passo=testar");
    await page.waitForLoadState("networkidle");
    const m = await page.evaluate(() => {
      const assistente = document.querySelector("main")!.parentElement!;
      const caixa = document
        .querySelector('[data-slot="montagem-bancada"] textarea')!
        .getBoundingClientRect();
      return {
        rola: assistente.scrollHeight > assistente.clientHeight + 1,
        // A PÁGINA do preview rola por causa da barra "Abrir o passo", que só
        // existe em /design; o que se mede é o assistente, que é a tela real.
        cabe: assistente.getBoundingClientRect().height <= innerHeight + 1,
        caixaVisivel: caixa.bottom <= innerHeight,
      };
    });
    expect(m, `${w}px`).toEqual({ rola: false, cabe: true, caixaVisivel: true });
  }
});

test("recomeçar conversa fica sempre à vista e limpa o chat", async ({ page }) => {
  await agenteFalso(page, 100);
  await page.goto("/design/montagem?passo=testar");
  await page.waitForLoadState("networkidle");
  const recomecar = page.getByRole("button", { name: "Recomeçar conversa" });
  // À vista antes da primeira mensagem (decisão do dono, 26/09/2026).
  await expect(recomecar).toBeVisible();
  // O aviso de rascunho saiu: ninguém entendia o que ele queria dizer.
  await expect(page.getByText(/Retomamos de onde você parou/)).toHaveCount(0);

  const bancada = page.locator('[data-slot="montagem-bancada"]');
  await bancada.getByRole("textbox").fill("oi");
  await bancada.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(bancada.getByText("Como posso te ajudar hoje?")).toBeVisible({
    timeout: 5_000,
  });
  await recomecar.click();
  await expect(bancada.getByText("Como posso te ajudar hoje?")).toHaveCount(0);
  await expect(bancada.getByText("oi", { exact: true })).toHaveCount(0);
});
