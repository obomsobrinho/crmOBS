import { test, expect } from "@playwright/test";
import { servico, tenantDeTeste } from "./semente";
import { FUSO } from "../lib/fuso";

// A CENTRAL "CLIENTES" com a sessão REAL do dono do produto (docs/plano-central-clientes.md,
// entrega 1). O dono de teste (`E2E_EMAIL`) está em `ADMIN_USER_IDS` (conferido em
// 14/10/2026), então este arquivo prova o lado do admin: a lista, o detalhe nas
// três abas e as rotas da API com os formatos documentados. O espelho (quem não é
// admin) vive em `atendente.att.spec.ts`.
//
// SÓ LEITURA, de propósito: nada aqui escreve no banco (o limite de IA não é
// tocado; editar é provado no preview, e a função de troca no custo-ia.serial).
// O tenant olhado é o do próprio dono de teste (OBS).

let clientId = "";
let nome = "";

test.beforeAll(async () => {
  const svc = servico();
  clientId = (await tenantDeTeste(svc)).clientId;
  const { data } = await svc.from("clients").select("name").eq("id", clientId).single();
  nome = data?.name ?? "";
});

const FALHA = /Não deu para ler/;

test.describe("Central Clientes: o dono do produto", () => {
  test("o menu mostra Clientes e /admin leva à lista", async ({ page }) => {
    await page.goto("/painel");
    const item = page.getByRole("link", { name: "Clientes", exact: true });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("href", "/clientes");

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/clientes$/, { timeout: 30_000 });
  });

  test("a lista abre, acha o cliente pela busca e a linha leva ao detalhe", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-slot="central-cliente"]').first()).toBeVisible();

    await page.getByLabel("Buscar clientes").fill(nome);
    const linha = page.locator('[data-slot="central-cliente"]', { hasText: nome });
    await expect(linha.first()).toBeVisible();
    await linha.first().click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}$`), { timeout: 30_000 });
    await expect(page.locator('[data-slot="central-detalhe-nome"]')).toHaveText(nome);
  });

  test("o detalhe renderiza as três abas, sem a falha de leitura", async ({ page }) => {
    await page.goto(`/clientes/${clientId}`);
    await expect(page.locator('[data-slot="central-detalhe-nome"]')).toHaveText(nome, { timeout: 30_000 });
    await expect(page.locator('[data-slot="admin-situacao"]').first()).toBeVisible();

    // Visão geral: vem do servidor (a mesma linha da lista, por `p_id`).
    await expect(page.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-slot="visao-nome"]')).toHaveText(nome);
    await expect(page.locator('[data-slot="visao-dono"]')).not.toBeEmpty();
    await expect(page.locator('[data-slot="visao-conexao"]')).toBeVisible();
    await expect(page.getByText(FALHA)).toHaveCount(0);

    // Uso de IA: lê pela rota do admin ao abrir.
    await page.getByRole("tab", { name: "Uso de IA" }).click();
    await expect(page.locator('[data-bloco="central-uso"]')).toBeVisible();
    await expect(page.locator('[data-bloco="uso-tokens"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-bloco="uso-turnos"]')).toBeVisible();
    await expect(page.locator('[data-bloco="central-picos"]')).toBeVisible();
    await expect(page.getByText(FALHA)).toHaveCount(0);

    // Atendimento: os quatro períodos chegam numa leitura, e trocar não busca de novo.
    await page.getByRole("tab", { name: "Atendimento" }).click();
    await expect(page.locator('[data-bloco="atendimento-conversas"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-bloco="atendimento-regras"]')).toBeVisible();
    await expect(page.getByText(FALHA)).toHaveCount(0);
    await page.getByRole("tab", { name: "Mês" }).click();
    await expect(page.locator('[data-bloco="atendimento-conversas"]')).toContainText("últimos 30 dias");
    await expect(page.getByText(FALHA)).toHaveCount(0);
  });

  test("um link antigo de contato em /clientes/{id numérico} leva a Contatos", async ({ page }) => {
    await page.goto("/clientes/999999999");
    await expect(page).toHaveURL(/\/contatos$/, { timeout: 30_000 });
  });
});

test.describe("Central Clientes: rotas da API do admin", () => {
  test("GET /api/admin/empresas: a lista, com o cliente e os campos da linha", async ({ page }) => {
    const res = await page.request.get(`/api/admin/empresas?busca=${encodeURIComponent(nome)}`);
    expect(res.status()).toBe(200);
    const corpo = (await res.json()) as { itens: Record<string, unknown>[] };
    expect(Array.isArray(corpo.itens)).toBe(true);
    const e = corpo.itens.find((i) => i.id === clientId);
    expect(e).toBeTruthy();
    expect(e).toMatchObject({
      nome,
      situacao: { chave: expect.any(String), rotulo: expect.any(String) },
      consumo: expect.stringMatching(/^(normal|aviso|parado)$/),
      estado: expect.stringMatching(/^(ativa|aviso|parada|desligada)$/),
    });
    expect(Array.isArray(e!.alertas)).toBe(true);
    expect(typeof e!.usados).toBe("number");
    expect(typeof e!.limite).toBe("number");
    expect(typeof e!.temInstancia).toBe("boolean");
  });

  test("GET /api/admin/empresas recusa filtro e cursor tortos com 400", async ({ page }) => {
    expect((await page.request.get("/api/admin/empresas?situacao=lifetime")).status()).toBe(400);
    expect((await page.request.get("/api/admin/empresas?depoisId=nao-e-uuid")).status()).toBe(400);
  });

  test("GET /uso: os quatro períodos (Dia = hoje por hora desde as 00h, os outros por dia) e os picos de cada chip", async ({ page }) => {
    const res = await page.request.get(`/api/admin/empresas/${clientId}/uso`);
    expect(res.status()).toBe(200);
    const u = (await res.json()) as {
      periodos: Record<
        string,
        {
          periodo: string;
          unidade: string;
          total: { turnos: number; usados: number };
          barras: { chave: string; usados: number; turnos: number }[];
        }
      >;
      picos: Record<string, { dias: [string, number][]; cubo: [number, number, number][] }>;
      primeiraAtividade: string | null;
    };
    expect(u.primeiraAtividade === null || /^\d{4}-\d{2}-\d{2}$/.test(u.primeiraAtividade)).toBe(true);
    // O Dia é o dia civil de São Paulo: da 00h até a hora atual, as duas inclusive.
    const horaAgora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(new Date())) % 24;
    expect(Object.keys(u.periodos).sort()).toEqual(["dia", "mes", "quinzena", "semana"]);
    const colunas: Record<string, [string, number]> = {
      dia: ["hora", horaAgora + 1],
      semana: ["dia", 7],
      quinzena: ["dia", 15],
      mes: ["dia", 30],
    };
    for (const [k, [unidade, n]] of Object.entries(colunas)) {
      const p = u.periodos[k];
      expect(p.periodo).toBe(k);
      expect(p.unidade).toBe(unidade);
      expect(p.barras).toHaveLength(n);
      // A soma das colunas é o total do período (mesma fonte).
      expect(p.barras.reduce((s, b) => s + b.usados, 0)).toBe(p.total.usados);
      expect(p.barras.reduce((s, b) => s + b.turnos, 0)).toBe(p.total.turnos);
    }
    // Janelas aninhadas: o mês contém a quinzena, que contém a semana.
    expect(u.periodos.mes.total.usados).toBeGreaterThanOrEqual(u.periodos.quinzena.total.usados);
    expect(u.periodos.quinzena.total.usados).toBeGreaterThanOrEqual(u.periodos.semana.total.usados);
    // Os picos de cada chip: os turnos por dia somam os turnos do período (a mesma janela, o mesmo banco).
    expect(Object.keys(u.picos).sort()).toEqual(["dia", "mes", "quinzena", "semana"]);
    for (const k of ["semana", "quinzena", "mes"]) {
      const dosPicos = u.picos[k].dias.reduce((s, [, n]) => s + n, 0);
      expect(dosPicos, k).toBe(u.periodos[k].total.turnos);
      expect(u.picos[k].cubo.reduce((s, [, , n]) => s + n, 0), k).toBe(dosPicos);
    }
  });

  test("GET /uso?mes e ?tudo: um mês por dia, todo o período por mês, e parâmetro torto é 400", async ({ page }) => {
    const base = `/api/admin/empresas/${clientId}/uso`;
    const mes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    const atual = await page.request.get(`${base}?mes=${mes}`);
    expect(atual.status()).toBe(200);
    type Historico = {
      uso: { periodo: string | null; unidade: string; total: { usados: number; turnos: number }; barras: { chave: string; usados: number }[] };
      picos: { dias: [string, number][]; cubo: [number, number, number][] };
      janela: { de: string; ate: string };
    };
    const m = (await atual.json()) as Historico;
    expect(m.uso.periodo).toBeNull();
    expect(m.uso.unidade).toBe("dia");
    expect(m.uso.barras.reduce((s, b) => s + b.usados, 0)).toBe(m.uso.total.usados);
    // Os picos são da MESMA janela do uso: a soma dos turnos por dia é a dos turnos do mês.
    expect(m.picos.dias.reduce((s, [, n]) => s + n, 0)).toBe(m.uso.total.turnos);
    expect(m.janela.de).toBe(`${mes}-01`);

    const tudo = await page.request.get(`${base}?tudo=1`);
    expect(tudo.status()).toBe(200);
    const t = (await tudo.json()) as Historico;
    expect(t.uso.unidade).toBe("mes");
    expect(t.uso.barras.length).toBeGreaterThanOrEqual(1);
    expect(t.uso.barras.at(-1)!.chave).toBe(mes);
    expect(t.uso.barras.reduce((s, b) => s + b.usados, 0)).toBe(t.uso.total.usados);
    expect(t.picos.dias.reduce((s, [, n]) => s + n, 0)).toBe(t.uso.total.turnos);

    // Um intervalo de datas: as duas pontas contam, e o uso e os picos são do mesmo intervalo.
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
    const iv = await page.request.get(`${base}?de=${t.janela.de}&ate=${hoje}`);
    expect(iv.status()).toBe(200);
    const ivj = (await iv.json()) as Historico;
    expect(ivj.janela).toEqual({ de: t.janela.de, ate: hoje });
    expect(ivj.picos.dias.reduce((s, [, n]) => s + n, 0)).toBe(ivj.uso.total.turnos);
    expect((await page.request.get(`${base}?de=${hoje}&ate=2000-01-01`)).status()).toBe(400);
    expect((await page.request.get(`${base}?de=${hoje}`)).status()).toBe(400);
    expect((await page.request.get(`${base}?de=lixo&ate=${hoje}`)).status()).toBe(400);

    expect((await page.request.get(`${base}?mes=2026-13`)).status()).toBe(400);
    expect((await page.request.get(`${base}?mes=lixo`)).status()).toBe(400);
    expect((await page.request.get(`${base}?mes=2999-01`)).status()).toBe(400);
    expect((await page.request.get(`${base}?tudo=2`)).status()).toBe(400);
    expect((await page.request.get(`${base}?tudo=1&mes=${mes}`)).status()).toBe(400);
  });

  test("GET /atendimento: os quatro períodos do painel numa resposta", async ({ page }) => {
    const res = await page.request.get(`/api/admin/empresas/${clientId}/atendimento`);
    expect(res.status()).toBe(200);
    const a = (await res.json()) as Record<string, Record<string, unknown>>;
    expect(Object.keys(a).sort()).toEqual(["dia", "mes", "quinzena", "semana"]);
    for (const [periodo, p] of Object.entries(a)) {
      expect(p.periodo).toBe(periodo);
      expect(typeof p.conversas).toBe("number");
      expect(typeof p.semIntervencao).toBe("number");
      expect(p.semIntervencao as number).toBeLessThanOrEqual(p.conversas as number);
      expect(typeof p.respostasIa).toBe("number");
      expect(typeof p.regrasSalvas).toBe("number");
      const pedidos = p.pedidos as { total: number; motivos: unknown[]; solucoes: unknown[] };
      expect(typeof pedidos.total).toBe("number");
      expect(Array.isArray(pedidos.motivos)).toBe(true);
      expect(Array.isArray(pedidos.solucoes)).toBe(true);
      // O movimento: uma coluna por hora (Dia) ou por dia, com as respostas da IA e do time.
      const mov = p.movimento as { unidade: string; barras: { ia: number; time: number }[] };
      expect(mov.unidade).toBe(periodo === "dia" ? "hora" : "dia");
      expect(mov.barras).toHaveLength({ dia: 24, semana: 7, quinzena: 15, mes: 30 }[periodo] as number);
      for (const b of mov.barras) {
        expect(typeof b.ia).toBe("number");
        expect(typeof b.time).toBe("number");
      }
    }
    // Janelas aninhadas: o mês contém a semana, que contém o dia.
    const n = (k: string) => a[k].conversas as number;
    expect(n("mes")).toBeGreaterThanOrEqual(n("quinzena"));
    expect(n("quinzena")).toBeGreaterThanOrEqual(n("semana"));
    expect(n("semana")).toBeGreaterThanOrEqual(n("dia"));
  });

  test("GET /whatsapp: o estado ao vivo, num dos quatro valores da central", async ({ page }) => {
    const res = await page.request.get(`/api/admin/empresas/${clientId}/whatsapp`);
    expect(res.status()).toBe(200);
    const corpo = (await res.json()) as { estado: string };
    expect(["conectado", "reconectando", "desconectado", "desconhecido"]).toContain(corpo.estado);
  });

  test("id que não é uuid é 400 em toda rota com [id]", async ({ page }) => {
    for (const rota of ["uso", "atendimento", "whatsapp"]) {
      expect((await page.request.get(`/api/admin/empresas/nao-e-uuid/${rota}`)).status(), rota).toBe(400);
    }
  });

  test("um uuid que não é cliente responde 404 nas rotas de leitura por cliente", async ({ page }) => {
    const fantasma = "00000000-0000-4000-8000-0000000000ff";
    for (const rota of ["atendimento", "whatsapp"]) {
      expect((await page.request.get(`/api/admin/empresas/${fantasma}/${rota}`)).status(), rota).toBe(404);
    }
  });
});
