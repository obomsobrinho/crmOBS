import { test, expect } from "@playwright/test";
import { FUSO as FUSO_FORMAT } from "../lib/format";
import { FUSO, dataLongaSP, diaIsoSP, diaMesCurtoSP, diaMesHoraSP } from "../lib/fuso";
import { ehManual } from "../lib/mensagem";
import { cleanName, nomeDoContato } from "../lib/inbox";
import { idadeEmDias } from "../lib/pipeline";
import { chaveTelefone, grafiasDeDigitos, grafiasDoNumeroDeAvisos, digitosDoJid } from "../lib/avisos";
import { grafiasDoTelefone, jidDePessoa } from "../lib/clientes";
import { foraDaLista } from "../lib/inbox-lista";

// DEDUPLICAÇÃO DE lib/ (R-39, R-57, R-58, front F12). O comportamento tem de ser
// BYTE A BYTE o de antes: cada teste abaixo carrega a implementação ANTIGA
// (copiada como estava) e prova old == new em entradas representativas.

// Instantes ao redor da meia-noite de São Paulo (UTC-3, sem horário de verão
// desde 2019): 02:59:59Z ainda é o dia anterior, 03:00:00Z já é o dia novo.
const INSTANTES = [
  "2026-09-30T02:59:59.999Z",
  "2026-09-30T03:00:00.000Z",
  "2026-09-30T23:59:59Z",
  "2026-10-01T00:00:00Z",
  "2026-10-01T02:59:59Z",
  "2026-10-01T03:00:00Z",
  "2026-10-01T14:05:00Z",
  "2026-12-31T23:30:00-03:00",
  "2027-01-01T02:59:59Z",
  "2027-01-01T03:00:00Z",
  "2026-02-28T21:00:00-03:00",
  "2028-02-29T23:59:00-03:00",
];

test.describe("Fuso e datas (lib/fuso.ts)", () => {
  test("uma fonte só do fuso, e format.ts reexporta a mesma", () => {
    expect(FUSO).toBe("America/Sao_Paulo");
    expect(FUSO_FORMAT).toBe(FUSO);
  });

  test("diaIsoSP igual ao formatador en-CA que cada módulo criava", () => {
    const antigo = (d: number | Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    for (const iso of INSTANTES) {
      const ms = Date.parse(iso);
      expect(diaIsoSP(ms)).toBe(antigo(ms));
      expect(diaIsoSP(new Date(ms))).toBe(antigo(new Date(ms)));
    }
    // A meia-noite de São Paulo vira o dia; em UTC já seria o dia seguinte.
    expect(diaIsoSP(Date.parse("2026-10-01T02:59:59Z"))).toBe("2026-09-30");
    expect(diaIsoSP(Date.parse("2026-10-01T03:00:00Z"))).toBe("2026-10-01");
  });

  test("idadeEmDias (pipeline) igual à versão que criava um formatador por chamada", () => {
    const antigo = (iso: string | null, agora: number): string | null => {
      if (!iso) return null;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms)) return null;
      const dia = (d: number) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(d));
      const a = dia(ms);
      const b = dia(agora);
      if (a === b) return "hoje";
      const dias = Math.round(
        (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000
      );
      if (dias <= 0) return "hoje";
      return dias === 1 ? "1 dia" : `${dias} dias`;
    };
    const agora = Date.parse("2026-10-01T02:30:00Z"); // 23:30 de 30/09 em SP
    for (const iso of [...INSTANTES, null, "", "lixo"]) {
      expect(idadeEmDias(iso, agora)).toBe(antigo(iso, agora));
      expect(idadeEmDias(iso, agora + 3_600_000)).toBe(antigo(iso, agora + 3_600_000));
    }
    expect(idadeEmDias("2026-09-30T23:00:00-03:00", Date.parse("2026-10-01T05:00:00Z"))).toBe("1 dia");
  });

  test("formatadores de tela iguais aos toLocale* que cada tela escrevia", () => {
    for (const iso of INSTANTES) {
      const d = new Date(iso);
      expect(dataLongaSP(iso)).toBe(
        d.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "America/Sao_Paulo",
        })
      );
      expect(diaMesCurtoSP(iso)).toBe(
        d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
      );
      const hora = {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      } as const;
      expect(diaMesHoraSP(iso)).toBe(d.toLocaleString("pt-BR", hora));
      expect(diaMesHoraSP(d.getTime())).toBe(d.toLocaleString("pt-BR", hora));
    }
  });
});

test.describe("Nome do contato (lib/inbox.ts nomeDoContato)", () => {
  const antigo = (c: { display_name?: string | null; nomewpp?: string | null } | null | undefined) =>
    cleanName(c?.display_name) ?? cleanName(c?.nomewpp);

  const CASOS: ({ display_name?: string | null; nomewpp?: string | null } | null | undefined)[] = [
    { display_name: "Ana", nomewpp: "Ana Silva" },
    { display_name: "  Ana  ", nomewpp: "Zé" },
    { display_name: null, nomewpp: "Zé" },
    { display_name: "", nomewpp: "Zé" },
    { display_name: "   ", nomewpp: "Zé" },
    { display_name: "Você", nomewpp: "Zé" },
    { display_name: "voce", nomewpp: "Zé" },
    { display_name: "Ana", nomewpp: "Você" },
    { display_name: null, nomewpp: "Você" },
    { display_name: "VOCÊ", nomewpp: "voce" },
    { display_name: null, nomewpp: null },
    { display_name: undefined, nomewpp: undefined },
    { nomewpp: "Loja do Zé" },
    { display_name: "Ótica" },
    {},
    null,
    undefined,
  ];

  test("display_name precede o nomewpp; Você e vazio não são nome", () => {
    for (const c of CASOS) expect(nomeDoContato(c)).toBe(antigo(c));
    expect(nomeDoContato({ display_name: "Ana", nomewpp: "Zé" })).toBe("Ana");
    expect(nomeDoContato({ display_name: "Você", nomewpp: "Zé" })).toBe("Zé");
    expect(nomeDoContato({ display_name: "", nomewpp: "Você" })).toBeNull();
  });
});

test.describe("Grafias do telefone (lib/avisos.ts grafiasDeDigitos)", () => {
  // As três cópias antigas, como estavam.
  const antigoAvisos = (destino: string | null | undefined): string[] => {
    const d = digitosDoJid(destino);
    if (!d) return [];
    const chave = chaveTelefone(d);
    const grafias = new Set([d, chave]);
    if (chave.length === 12 && chave.startsWith("55")) {
      grafias.add(`${chave.slice(0, 4)}9${chave.slice(4)}`);
    }
    return [...grafias];
  };
  const antigoClientes = (digitos: string): string[] => {
    const chave = chaveTelefone(digitos);
    const nums = new Set([digitos, chave]);
    if (chave.length === 12 && chave.startsWith("55")) nums.add(`${chave.slice(0, 4)}9${chave.slice(4)}`);
    return [...nums].flatMap((n) => [n, jidDePessoa(n)]);
  };
  const antigoFora = (destino: string | null | undefined): string[] => {
    if (!destino || destino.includes("@g.us")) return [];
    const d = destino.split("@")[0].replace(/\D/g, "");
    if (!d) return [];
    const chave = chaveTelefone(d);
    const g = new Set([d, chave]);
    if (chave.length === 12 && chave.startsWith("55")) g.add(`${chave.slice(0, 4)}9${chave.slice(4)}`);
    return [...g];
  };

  const NUMEROS = [
    "5511912345678", // com 55 e com nono dígito
    "551112345678", // com 55, sem nono dígito
    "11912345678", // sem 55, com nono dígito
    "1112345678", // sem 55, sem nono dígito
    "5535984774753",
    "553584774753",
    "5500000000001", // DDD 00 da conversa de teste
    "+55 (11) 91234-5678",
    "351912345678", // outro país
    "",
  ];
  const JIDS = [
    ...NUMEROS.map((n) => `${n}@s.whatsapp.net`),
    "120363000000000001@g.us",
    "5511912345678", // sem sufixo
    "5511912345678@lid",
    "@s.whatsapp.net",
    null,
    undefined,
    "",
  ];

  test("grafiasDoNumeroDeAvisos == versão antiga, mesma ordem", () => {
    for (const j of JIDS) expect(grafiasDoNumeroDeAvisos(j)).toEqual(antigoAvisos(j));
  });

  test("grafiasDoTelefone (Novo cliente) == versão antiga, mesma ordem", () => {
    for (const n of NUMEROS) expect(grafiasDoTelefone(n)).toEqual(antigoClientes(n));
  });

  test("foraDaLista (p_fora do SQL) == versão antiga, mesma ordem", () => {
    for (const j of JIDS) expect(foraDaLista(j)).toEqual(antigoFora(j));
  });

  test("a grafia com o nono dígito aparece só para celular BR de 12 dígitos", () => {
    expect(grafiasDeDigitos("551112345678")).toEqual(["551112345678", "5511912345678"]);
    expect(grafiasDeDigitos("5511912345678")).toEqual(["5511912345678", "551112345678"]);
    expect(grafiasDeDigitos("351912345678")).toEqual(["351912345678"]);
  });
});

test.describe("Quem enviou (lib/mensagem.ts ehManual)", () => {
  test("só 'manual' é envio do CRM", () => {
    expect(ehManual("manual")).toBe(true);
    for (const t of ["imported", "ai", "text", "", null]) expect(ehManual(t)).toBe(false);
  });
});
