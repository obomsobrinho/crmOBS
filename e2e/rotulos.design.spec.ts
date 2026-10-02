import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  ROTULO_CHAVES,
  ROTULO_NEUTRO,
  chaveDoRotulo,
  coresDoRotulo,
} from "../lib/rotulos";
import { stageColor, STAGE_COLOR_KEYS } from "../lib/pipeline";
import { tagColor, TAG_COLOR_KEYS } from "../lib/crm";

// R-48 (02/10/2026): UMA paleta de rótulos para tags e estágios, oito matizes,
// nenhum verde, âmbar ou vermelho (cores de ESTADO), com valor nos dois temas.
// Peças puras e o próprio globals.css: nada de navegador.

test.describe("Paleta única de rótulos (lib/rotulos.ts)", () => {
  test("são oito matizes e nenhum é cor de estado", () => {
    expect(ROTULO_CHAVES).toHaveLength(8);
    for (const proibida of ["green", "amber", "red", "orange", "yellow", "teal"]) {
      expect(ROTULO_CHAVES as readonly string[]).not.toContain(proibida);
    }
    // As duas telas oferecem a MESMA lista.
    expect([...TAG_COLOR_KEYS]).toEqual([...ROTULO_CHAVES]);
    expect([...STAGE_COLOR_KEYS]).toEqual([...ROTULO_CHAVES]);
  });

  test("as chaves já gravadas viram o matiz permitido mais próximo", () => {
    // Funil: gray, blue, violet, amber, green, pink, orange. Tag: purple, green,
    // amber, red, blue, gray.
    expect(chaveDoRotulo("gray")).toBe("gray");
    expect(chaveDoRotulo("blue")).toBe("blue");
    expect(chaveDoRotulo("violet")).toBe("violet");
    expect(chaveDoRotulo("purple")).toBe("violet");
    expect(chaveDoRotulo("pink")).toBe("pink");
    expect(chaveDoRotulo("green")).toBe("cyan");
    expect(chaveDoRotulo("amber")).toBe("stone");
    expect(chaveDoRotulo("orange")).toBe("stone");
    expect(chaveDoRotulo("red")).toBe("pink");
  });

  test("valor desconhecido, vazio ou nulo cai no neutro", () => {
    for (const v of ["", "magenta", "GREEN", null, undefined]) {
      expect(chaveDoRotulo(v)).toBe(ROTULO_NEUTRO);
    }
  });

  test("a cor desenhada é variável CSS (tema por token), igual nas duas telas", () => {
    expect(tagColor("green")).toBe("var(--rotulo-cyan-fill)");
    expect(stageColor("green")).toBe(tagColor("green"));
    expect(coresDoRotulo("indigo")).toEqual({
      chave: "indigo",
      fill: "var(--rotulo-indigo-fill)",
      on: "var(--rotulo-indigo-on)",
      ink: "var(--rotulo-indigo-ink)",
      surface: "var(--rotulo-indigo-surface)",
    });
  });
});

// Contraste WCAG medido NOS VALORES do globals.css (claro e escuro).
const luz = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luz(a), luz(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function leitura(bloco: string) {
  const v: Record<string, string> = {};
  for (const m of bloco.matchAll(/--rotulo-([a-z]+)-(fill|on|ink|surface):\s*(#[0-9a-f]{6})/gi)) {
    v[`${m[1]}-${m[2]}`] = m[3];
  }
  return v;
}

test.describe("Paleta de rótulos: tokens e contraste AA no globals.css", () => {
  const css = fs.readFileSync("app/globals.css", "utf8");
  const iEscuro = css.indexOf('[data-theme="dark"] {');
  const claro = leitura(css.slice(0, iEscuro));
  const escuro = leitura(css.slice(iEscuro));

  for (const [tema, v, raised] of [
    ["claro", claro, "#ffffff"],
    ["escuro", escuro, "#171717"],
  ] as const) {
    test(`tema ${tema}: oito matizes com os quatro papéis, todos AA`, () => {
      for (const chave of ROTULO_CHAVES) {
        for (const papel of ["fill", "on", "ink", "surface"]) {
          expect(v[`${chave}-${papel}`], `${chave}-${papel} no tema ${tema}`).toBeTruthy();
        }
        // Texto: tinta sobre o fill, e o matiz como texto sobre a superfície
        // tingida e sobre o cartão. Gráfico (a bolinha): 3:1 sobre o cartão.
        expect(contraste(v[`${chave}-on`], v[`${chave}-fill`]), `${chave} on/fill`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v[`${chave}-ink`], v[`${chave}-surface`]), `${chave} ink/surface`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v[`${chave}-ink`], raised), `${chave} ink/raised`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v[`${chave}-fill`], raised), `${chave} fill/raised`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
