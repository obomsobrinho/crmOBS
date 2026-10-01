import { test, expect } from "@playwright/test";
import {
  cadastroCompleto,
  casaBusca,
  LIMIAR_FRIO_DIAS,
  diasSemContato,
  emConversa,
  estadoContato,
  grafiasDoTelefone,
  montarClientes,
  telaParaIso,
  telefoneDoCadastro,
  textoUltimoContato,
  type ContatoClienteRow,
} from "../lib/clientes";
import { buildInbox, type ConvRow } from "../lib/inbox";

// TELA DE CLIENTES, fatia A (30/09/2026, docs/plano-clientes.md).
//
// A regra (lib/clientes.ts, pura) testada direto, e a tela no /design com dado
// FALSO. Prova desenho, texto e regra, nunca o banco (isso é o clientes.auth).

const contato = (id: number, telefone: string, extra: Partial<ContatoClienteRow> = {}): ContatoClienteRow => ({
  id,
  telefone,
  nomewpp: null,
  display_name: null,
  atendimento_ia: "ativa",
  custom_fields: {},
  email: null,
  birth_date: null,
  created_at: "2026-09-01T12:00:00Z",
  ...extra,
});

test.describe("Regra da lista (lib/clientes.ts)", () => {
  const contatos = [
    contato(1, "5511912345678", { nomewpp: "Você" }),
    contato(2, "5511988887777", { display_name: "José Antônio", custom_fields: { Empresa: "Padaria Estrela" } }),
    contato(3, "553584774753", { display_name: "Ana", email: "ana@x.com", birth_date: "1990-01-02" }),
  ];
  const conversas = [
    { id: 10, phone: "5511988887777", last_message_at: "2026-09-29T15:00:00Z", assigned_user_id: null },
    { id: 11, phone: "5511912345678", last_message_at: "2026-09-30T13:00:00Z", assigned_user_id: null },
  ];
  const tags = [{ conversation_id: 10, tags: { name: "Orçamento", color: "amber" } }];

  test("o número de avisos não é cliente, e 'Você' não é nome", () => {
    const l = montarClientes(contatos, conversas, tags, "5511912345678@s.whatsapp.net");
    expect(l.map((c) => c.id)).toEqual([2, 3]);
    const todos = montarClientes(contatos, conversas, tags, null);
    expect(todos[0]).toMatchObject({ id: 1, name: null });
    // Sem conversa vai para o fim.
    expect(todos.at(-1)?.id).toBe(3);
  });

  test("a busca olha nome sem acento, tag, campo e telefone tolerando o nono dígito", () => {
    const [ze] = montarClientes([contatos[1]], conversas, tags, null);
    expect(casaBusca(ze, "jose antonio")).toBe(true);
    expect(casaBusca(ze, "orcamento")).toBe(true);
    expect(casaBusca(ze, "estrela")).toBe(true);
    expect(casaBusca(ze, "8888")).toBe(true);
    expect(casaBusca(ze, "zzz")).toBe(false);
    const [ana] = montarClientes([contatos[2]], [], [], null);
    // Guardado sem o 9, buscado com ele.
    expect(casaBusca(ana, "35 9 8477-4753")).toBe(true);
  });

  test("cadastro conta Nome dado pelo time, Nascimento e E-mail", () => {
    const l = montarClientes(contatos, [], [], null);
    expect(cadastroCompleto(l.find((c) => c.id === 3)!)).toBe(true);
    // pushName não é cadastro.
    const soPush = montarClientes([contato(9, "1", { nomewpp: "Carla" })], [], [], null)[0];
    expect(soPush.name).toBe("Carla");
    expect(soPush.nomeCadastrado).toBe(false);
  });

  test("'em conversa' é o dia civil de São Paulo, não as últimas 24h", () => {
    const agora = Date.parse("2026-09-30T12:00:00Z"); // 9h em SP
    expect(emConversa("2026-09-30T03:30:00Z", agora)).toBe(true); // 0h30 em SP
    expect(emConversa("2026-09-30T02:30:00Z", agora)).toBe(false); // 23h30 de ontem em SP
    expect(textoUltimoContato("2026-09-29T15:00:00Z", agora)).toBe("Ontem");
    expect(textoUltimoContato("2026-09-20T15:00:00Z", agora)).toBe("Há 10 dias");
    expect(textoUltimoContato("2026-07-14T15:00:00Z", agora)).toBe("14 jul");
  });

  test("nascimento: DD/MM/AAAA vira data do banco, e data impossível é recusada", () => {
    expect(telaParaIso("14/03/1988")).toBe("1988-03-14");
    expect(telaParaIso("")).toBeNull();
    expect(telaParaIso("31/02/1990")).toBeUndefined();
    expect(telaParaIso("14/03")).toBeUndefined();
    expect(telaParaIso("01/01/2999")).toBeUndefined();
  });
});

test.describe("Contato frio (lib/clientes.ts, fatia C)", () => {
  // 9h de 30/09/2026 em São Paulo.
  const agora = Date.parse("2026-09-30T12:00:00Z");

  test("o limiar é 60 dias civis: 59 ainda não é frio, 60 já é", () => {
    expect(LIMIAR_FRIO_DIAS).toBe(60);
    expect(estadoContato("2026-08-02T15:00:00Z", agora)).toBe("normal"); // 59 dias
    expect(estadoContato("2026-08-01T15:00:00Z", agora)).toBe("frio"); // 60 dias
    expect(diasSemContato("2026-08-01T15:00:00Z", agora)).toBe(60);
    expect(diasSemContato("2026-08-02T15:00:00Z", agora)).toBeNull();
  });

  test("conta o dia de São Paulo, não o UTC", () => {
    // 23h30 de 01/08 em SP já é 02/08 em UTC: em SP são 60 dias, frio.
    expect(estadoContato("2026-08-02T02:30:00Z", agora)).toBe("frio");
    // 0h30 de 02/08 em SP: 59 dias, ainda não.
    expect(estadoContato("2026-08-02T03:30:00Z", agora)).toBe("normal");
  });

  test("nunca escreveu não é frio, é outro estado", () => {
    expect(estadoContato(null, agora)).toBe("nunca");
    expect(diasSemContato(null, agora)).toBeNull();
    expect(estadoContato("2026-09-30T10:00:00Z", agora)).toBe("conversa");
  });
});

test.describe("Tela de Clientes (/design/clientes)", () => {
  test("lista, busca, filtros e estados vazios", async ({ page }) => {
    await page.goto("/design/clientes");
    const itens = page.locator('[data-slot="clientes-item"]');
    await expect(itens).toHaveCount(17);
    await expect(page.locator("[data-clientes-vazio]")).toContainText("Escolha um cliente");

    const busca = page.getByLabel("Buscar clientes");
    await busca.fill("souza");
    await expect(itens).toHaveCount(1);
    await expect(itens.first()).toContainText("Marina Souza");
    await busca.fill("98477");
    await expect(itens).toHaveCount(1);
    await busca.fill("ninguem com esse nome");
    await expect(page.locator('[data-slot="clientes-vazio"]')).toContainText("Nenhum cliente para");
    await page.getByLabel("Limpar busca").click();

    await page.locator('[data-slot="clientes-chip"]', { hasText: "Em conversa" }).click();
    await expect(itens).toHaveCount(2);
    await page.locator('[data-slot="clientes-chip"]', { hasText: "Cadastro incompleto" }).click();
    // Completos no dado falso (nome dado pelo time, nascimento e e-mail):
    // Marina, Helena e Juliana. Os outros 14 são incompletos.
    await expect(itens).toHaveCount(14);

    await page.goto("/design/clientes?cenario=vazia");
    await expect(page.locator('[data-slot="clientes-vazio"]')).toContainText("Ainda não há clientes");
    await page.goto("/design/clientes?cenario=nova");
    await expect(itens).toHaveCount(3);
  });

  test("filtro de contato frio: 60+ dias, e quem nunca escreveu fica de fora", async ({ page }) => {
    await page.goto("/design/clientes");
    const itens = page.locator('[data-slot="clientes-item"]');
    const chip = page.locator('[data-slot="clientes-chip"]', { hasText: "Sem contato há 60+ dias" });
    await expect(chip).toContainText("6");
    await chip.click();
    await expect(itens).toHaveCount(6);
    await expect(itens.first()).toContainText("Sem contato há 70 dias");
    await expect(page.locator('[data-slot="clientes-item"]:not([data-frio])')).toHaveCount(0);
    await expect(itens.filter({ hasText: "Ana Clara" })).toHaveCount(0);

    await page.locator('[data-slot="clientes-chip"]', { hasText: "Todos" }).click();
    const ana = itens.filter({ hasText: "Ana Clara" });
    await expect(ana).toContainText("Nunca escreveu");
    await expect(ana).not.toHaveAttribute("data-frio", /.*/);

    // Chip com zero some (D4, a mesma regra das Conversas): na conta nova
    // ninguém esfriou, e o chip nem aparece.
    await page.goto("/design/clientes?cenario=nova");
    await expect(page.locator('[data-slot="clientes-chip"]', { hasText: "Sem contato" })).toHaveCount(0);
    await expect(page.locator('[data-slot="clientes-chip"]', { hasText: "Em conversa" })).toHaveCount(1);

    // Com um chip só, a faixa inteira some.
    await page.goto("/design/clientes?cenario=vazia");
    await expect(page.locator('[data-slot="clientes-chip"]')).toHaveCount(0);
  });

  test("a ficha do contato frio diz há quanto tempo, e a de quem está em dia não diz", async ({ page }) => {
    await page.goto("/design/clientes?sel=11");
    await expect(page.locator('[data-slot="ficha-frio"]')).toHaveText("Última mensagem há 70 dias");
    await page.goto("/design/clientes?sel=2");
    await expect(page.locator('[data-slot="ficha-abrir-conversa"]')).toBeVisible();
    await expect(page.locator('[data-slot="ficha-frio"]')).toHaveCount(0);
  });

  test("a ficha é a do painel da conversa, com o atalho e o Entendimento", async ({ page }) => {
    await page.goto("/design/clientes?sel=1");
    await expect(page.locator('[data-slot="clientes-item"][aria-current="page"]')).toContainText("Franck");
    await expect(page.locator('[data-slot="ficha-abrir-conversa"]')).toHaveAttribute("href", "/inbox/5535984774753");
    await expect(page.locator('[data-slot="ficha-entendimento"]')).toContainText("plano anual");
    await expect(page.locator('[data-slot="painel-completude"]')).toHaveText("1 de 3 preenchidos");
    await expect(page.getByLabel("Nascimento")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();

    // Data impossível não vai ao banco: fica na tela com o motivo.
    await page.getByLabel("Nascimento").fill("31021990");
    await expect(page.getByLabel("Nascimento")).toHaveValue("31/02/1990");
    await page.getByLabel("Nascimento").blur();
    await expect(page.locator('[data-slot="painel-dados-status"]')).toHaveText("data inválida");

    await page.goto("/design/clientes?sel=2");
    await expect(page.locator('[data-slot="painel-completude"]')).toHaveText("Completo");
  });

  test("texto de tela sem travessão e sem vocabulário de segmento", async ({ page }) => {
    for (const rota of ["/design/clientes?sel=1", "/design/clientes?cenario=vazia"]) {
      await page.goto(rota);
      const texto = await page.locator("body").innerText();
      expect(texto).not.toMatch(/[—–]/);
      expect(texto).not.toMatch(/paciente|consulta|agendamento/i);
    }
  });

  test("no celular é uma tela por vez, sem rolagem lateral", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design/clientes");
    await expect(page.locator('[data-slot="clientes-lista"]')).toBeVisible();
    await expect(page.locator("[data-clientes-vazio]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    // O número de dias do contato frio cabe inteiro na linha dele.
    await page.locator('[data-slot="clientes-chip"]', { hasText: "Sem contato" }).click();
    const linha = page.locator('[data-slot="clientes-contato-celular"]').last();
    await expect(linha).toHaveText("Sem contato há 150 dias");
    expect(await linha.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.goto("/design/clientes?sel=1");
    await expect(page.locator('[data-slot="painel-completude"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

// FATIA B (01/10/2026): criar contato e a primeira mensagem para quem nunca
// escreveu. O preview SIMULA (não grava, não envia); a rota é provada no
// clientes.serial, com o número impossível.
test.describe("Novo cliente (lib/clientes.ts, fatia B)", () => {
  test("telefone: DDD e número, 55 automático, celular começa com 9", () => {
    expect(telefoneDoCadastro("(11) 91234-5678")).toEqual({ ok: true, digitos: "5511912345678" });
    expect(telefoneDoCadastro("+55 35 8477-4753")).toEqual({ ok: true, digitos: "553584774753" });
    expect(telefoneDoCadastro("(00) 00000-0001")).toEqual({ ok: true, digitos: "5500000000001" });
    expect(telefoneDoCadastro("91234-5678").ok).toBe(false);
    expect(telefoneDoCadastro("(11) 81234-5678").ok).toBe(false);
    expect(telefoneDoCadastro("(01) 91234-5678").ok).toBe(false);
  });

  test("as grafias cobrem o nono dígito e o sufixo do WhatsApp", () => {
    const g = grafiasDoTelefone("5535984774753");
    expect(g).toContain("553584774753@s.whatsapp.net");
    expect(g).toContain("5535984774753@s.whatsapp.net");
    expect(g).toContain("553584774753");
    expect(grafiasDoTelefone("553584774753")).toContain("5535984774753@s.whatsapp.net");
  });
});

test.describe("Novo cliente e primeira mensagem (/design/clientes)", () => {
  test("Novo cliente: máscara, telefone obrigatório e motivo na tela", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.locator('[data-slot="clientes-novo"]').click();
    const dialogo = page.locator('[data-slot="novo-cliente"]');
    await expect(dialogo).toContainText("Cadastrar não envia nada");
    const salvar = dialogo.locator('[data-slot="novo-cliente-salvar"]');
    await expect(salvar).toBeDisabled();

    const tel = dialogo.locator('[data-campo="telefone"]');
    await tel.fill("1181234567");
    await expect(tel).toHaveValue("(11) 8123-4567");
    await tel.fill("11912345");
    await salvar.click();
    await expect(dialogo.locator('[data-slot="novo-cliente-motivo"]')).toContainText("DDD e o número");
    await tel.fill("11912345678");
    await expect(tel).toHaveValue("(11) 91234-5678");
    await dialogo.locator('[data-campo="email"]').fill("sem-arroba");
    await salvar.click();
    await expect(dialogo.locator('[data-slot="novo-cliente-motivo"]')).toHaveCount(1);
    await expect(dialogo.locator('[data-slot="novo-cliente-motivo"]')).toHaveText("E-mail inválido.");
    await dialogo.locator('[data-campo="email"]').fill("ana@exemplo.com");
    await dialogo.locator('[data-campo="nascimento"]').fill("02011990");
    await expect(dialogo.locator('[data-campo="nascimento"]')).toHaveValue("02/01/1990");
    await salvar.click();
    await expect(dialogo).toBeHidden();
  });

  test("busca por número sem resultado oferece cadastrar com o número preenchido", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.getByLabel("Buscar clientes").fill("11 97777-0000");
    await page.locator('[data-slot="clientes-vazio-novo"]').click();
    await expect(page.locator('[data-slot="novo-cliente"] [data-campo="telefone"]')).toHaveValue("(11) 97777-0000");
  });

  test("filtro 'Nunca escreveram' e o peso de cada ação na ficha", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.locator('[data-slot="clientes-chip"]', { hasText: "Nunca escreveram" }).click();
    await expect(page.locator('[data-slot="clientes-item"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="clientes-item"]')).toContainText("Ana Clara");

    // Quem nunca escreveu: aviso, sem "Abrir conversa".
    await page.goto("/design/clientes?sel=17");
    await expect(page.locator('[data-slot="ficha-nunca"]')).toHaveText("Este número nunca escreveu para você");
    await expect(page.locator('[data-slot="ficha-abrir-conversa"]')).toHaveCount(0);
    await page.locator('[data-slot="ficha-primeira-mensagem"]').click();
    const dialogo = page.locator('[data-slot="primeira-mensagem"]');
    await expect(dialogo).toContainText("pode bloquear o seu número");
    await expect(dialogo).toContainText("a IA fica pausada");
    const enviar = dialogo.locator('[data-slot="primeira-enviar"]');
    await dialogo.getByLabel("Primeira mensagem").fill("Oi Ana, aqui é da loja, como combinamos.");
    // Sem o aceite, não envia.
    await expect(enviar).toBeDisabled();
    await dialogo.locator('[data-slot="primeira-aceite"]').click();
    await expect(enviar).toBeEnabled();
    await enviar.click();
    await expect(dialogo).toBeHidden();

    // Quem já conversou: sem fricção, sem o aviso.
    await page.goto("/design/clientes?sel=2");
    await expect(page.locator('[data-slot="ficha-abrir-conversa"]')).toBeVisible();
    await expect(page.locator('[data-slot="ficha-primeira-mensagem"]')).toHaveCount(0);
  });

  test("diálogos sem travessão e cabendo no celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design/clientes?sel=17");
    await page.locator('[data-slot="ficha-primeira-mensagem"]').click();
    const primeira = page.locator('[data-slot="primeira-mensagem"]');
    expect(await primeira.innerText()).not.toMatch(/[—–]/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    await page.goto("/design/clientes");
    await page.locator('[data-slot="clientes-novo"]').click();
    const novo = page.locator('[data-slot="novo-cliente"]');
    expect(await novo.innerText()).not.toMatch(/[—–]/);
    const caixa = await novo.boundingBox();
    expect(caixa!.x).toBeGreaterThanOrEqual(0);
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(375);
  });
});

test("conversa vazia do cadastro não aparece em Conversas nem no Pipeline (buildInbox)", () => {
  const base = { last_message_preview: null, last_message_from: null, unread_count: 0, assigned_user_id: null, handoff_at: null };
  const { items } = buildInbox(
    [
      { ...base, phone: "5511900000001@s.whatsapp.net", last_message_at: "2026-09-30T12:00:00Z" },
      { ...base, phone: "5511900000002@s.whatsapp.net", last_message_at: null as unknown as string },
    ] as unknown as ConvRow[],
    []
  );
  expect(items.map((i) => i.phone)).toEqual(["5511900000001@s.whatsapp.net"]);
});
