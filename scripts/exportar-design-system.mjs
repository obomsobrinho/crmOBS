// Exporta o design system como UM arquivo HTML autônomo.
//
// Por que existe: o design system não pode ficar preso a este projeto. O
// resultado abre com dois cliques em qualquer máquina, sem servidor, sem
// node_modules, sem build, e serve de referência para outros projetos.
//
// ⚠️ POR QUE ELE NASCE DA PÁGINA RENDERIZADA, e não de HTML escrito à mão:
// a versão anterior deste material era HTML solto com os valores copiados na
// unha, e envelheceu até citar tokens que já tinham sido apagados. Aqui o
// arquivo é uma FOTO do componente de verdade, com o CSS de verdade: se o botão
// mudar no projeto, a próxima exportação traz o botão mudado.
//
// ⚠️ E POR QUE OS NÚMEROS NÃO SÃO CONGELADOS NA FOTO: o HTML leva um script
// pequeno que refaz as mesmas leituras (`getComputedStyle`) que a página faz.
// Sem isso, trocar o tema dentro do arquivo mudaria as cores das amostras e
// deixaria os hexadecimais do tema anterior escritos embaixo, que é pior do que
// não mostrar valor nenhum.
//
// Uso:
//   1. npm run dev   (o exportador precisa da página no ar)
//   2. npm run design:export   [ou: node scripts/exportar-design-system.mjs destino.html]
//
// Padrão do destino: Desktop/design-system-obs.html

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

const PORTA = process.env.PORT_DEV || "3000";
const ORIGEM = `http://localhost:${PORTA}/design/sistema`;
const DESTINO = resolve(
  process.argv[2] || `${homedir()}/Desktop/design-system-obs.html`,
);

/* O script que vai DENTRO do arquivo exportado. Refaz as leituras da página e
   liga o botão de tema. É a única lógica que sobrevive à exportação, porque o
   React não vai junto. */
const SCRIPT_EMBUTIDO = `
(function () {
  var raiz = document.documentElement;

  function atualizar() {
    var cs = getComputedStyle(raiz);

    // Valor de cada token, embaixo da amostra que ele pinta.
    document.querySelectorAll("[data-token]").forEach(function (el) {
      var v = cs.getPropertyValue(el.getAttribute("data-token")).trim();
      el.textContent = v || "sem valor";
    });

    // Tamanho, entrelinha e peso MEDIDOS no texto renderizado.
    document.querySelectorAll("[data-papel]").forEach(function (el) {
      var e = getComputedStyle(el);
      var medida =
        Math.round(parseFloat(e.fontSize)) +
        " / " +
        Math.round(parseFloat(e.lineHeight)) +
        " \\u00b7 peso " +
        e.fontWeight;
      var alvo = document.querySelector(
        '[data-medida="' + el.getAttribute("data-papel") + '"]'
      );
      if (alvo) alvo.textContent = medida;
    });

    // Aqui morava o aviso calculado de "--raised e --s-conteudo são a mesma
    // cor". Ele resolveu o que existia para resolver: os dois viraram um só em
    // 30/08/2026 e --s-conteudo deixou de existir, então a leitura passou a
    // devolver string vazia e o aviso nunca mais poderia acender.
    // (Sem crase aqui: este bloco mora DENTRO de um template literal.)
  }

  var botao = document.getElementById("ds-tema");
  function pintarBotao() {
    var escuro = raiz.getAttribute("data-theme") === "dark";
    botao.textContent = escuro ? "Tema claro" : "Tema escuro";
  }
  botao.addEventListener("click", function () {
    var escuro = raiz.getAttribute("data-theme") === "dark";
    raiz.setAttribute("data-theme", escuro ? "light" : "dark");
    pintarBotao();
    atualizar();
  });

  pintarBotao();
  atualizar();
})();
`;

async function main() {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({
    viewport: { width: 1500, height: 1100 },
  });
  const pagina = await contexto.newPage();

  console.log("lendo", ORIGEM);
  try {
    await pagina.goto(ORIGEM, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    console.error(
      `\nNão consegui abrir ${ORIGEM}.\nSuba o servidor antes: npm run dev\n`,
    );
    await navegador.close();
    process.exit(1);
  }
  // Dá tempo de os efeitos preencherem os valores e as animações assentarem.
  await pagina.waitForTimeout(2500);

  const { corpo, css } = await pagina.evaluate(async () => {
    // O CSS compilado do Tailwind, buscado inteiro. É ele que carrega os tokens
    // dos dois temas e todas as classes usadas na página.
    const folhas = [...document.querySelectorAll("link[rel=stylesheet]")].map(
      (l) => l.href,
    );
    const partes = await Promise.all(
      folhas.map((h) =>
        fetch(h)
          .then((r) => r.text())
          .catch(() => ""),
      ),
    );

    const main = document.querySelector("main");
    const header = document.querySelector("header");

    return {
      corpo: (header?.outerHTML || "") + (main?.outerHTML || ""),
      css: partes.join("\n"),
    };
  });

  await navegador.close();

  if (!corpo.trim()) {
    console.error("\nA página abriu vazia. Nada foi escrito.\n");
    process.exit(1);
  }

  // ⚠️ Fora os `@font-face` do next/font. Eles apontam para `../media/*.woff2`,
  // que só existe servido pelo Next: no arquivo solto viram nove requisições
  // ERR_FILE_NOT_FOUND. Quem entrega as famílias aqui é o Google Fonts, então
  // essas regras são puro ruído. O corpo do @font-face não tem chave aninhada,
  // então casar até o primeiro `}` é seguro.
  const cssLimpo = css.replace(/@font-face\s*\{[^}]*\}/g, "");
  const fontesRemovidas = (css.match(/@font-face/g) || []).length;

  const agora = new Date().toLocaleDateString("pt-BR");

  // O botão de tema é NOVO: dentro do projeto quem troca o tema é o nav rail,
  // que não vem junto. Entra no cabeçalho, antes da navegação por âncora.
  const cabecalho = corpo.replace(
    "<nav",
    '<button id="ds-tema" type="button">Tema</button><nav',
  );

  const html = `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sistema de design OBS</title>

<!-- As duas famílias vêm do Google Fonts, e não do next/font: os arquivos que o
     Next gera moram no servidor do projeto, e este arquivo precisa abrir sozinho. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">

<style>
/* CSS do projeto, copiado em ${agora}, sem os @font-face do next/font. */
${cssLimpo}

/* As variáveis de fonte que o next/font declarava no <html>. */
:root {
  --font-manrope: "Manrope";
  --font-space-grotesk: "Space Grotesk";
}

/* O arquivo não tem o nav rail, então o cabeçalho ganha um botão de tema. */
#ds-tema {
  border: 1px solid var(--line);
  background: var(--raised);
  color: var(--ink);
  border-radius: var(--radius-lg);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
}
#ds-tema:hover { background: var(--s-bloco); }

/* O que era interativo por React (abas, chave) fica congelado no estado da
   foto. Marcar é mais honesto do que deixar clicar e nada acontecer. */
[data-slot="tabs-trigger"],
[data-slot="switch"] { cursor: default; }
</style>
</head>
<body class="antialiased">
${cabecalho}

<div style="padding: 0 32px 40px; font-size: 12px; line-height: 16px; color: var(--ink-3);">
  Arquivo gerado em ${agora} a partir de <code>/design/sistema</code>, com o CSS
  real do projeto. Cores, tamanhos e medidas são LIDOS do CSS ao abrir e ao
  trocar de tema, nunca escritos à mão. As abas e a chave estão congeladas no
  estado da foto: o React não vem junto.
</div>

<script>${SCRIPT_EMBUTIDO}</script>
</body>
</html>
`;

  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, html, "utf8");

  const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  console.log(`\nescrito: ${DESTINO}  (${kb} KB)`);
  console.log(`@font-face do next/font removidos: ${fontesRemovidas}`);
}

main();
