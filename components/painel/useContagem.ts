"use client";

import * as React from "react";

// O numeral que corre até o valor.
//
// É JS e não CSS porque não existe como interpolar o CONTEÚDO de texto de um
// elemento em CSS: `counter-reset` anima em alguns navegadores, mas não formata
// em pt-BR, e o painel precisa passar por "1.234" a caminho de "1.876".
//
// ⚠️ DOIS COMPORTAMENTOS, e é a diferença entre eles que o desenho pediu:
//
// - ENTRADA (a tela abriu): 0 até o valor, em 900ms. É o gesto que faz a tela
//   parecer viva.
// - TROCA DE PERÍODO: do valor ATUAL até o novo, em 420ms. Não volta para zero,
//   porque zerar e subir de novo lê como "carregando" e não como "mudou de
//   janela".
//
// E um NÃO-comportamento: re-render não recomeça nada. A animação só dispara
// quando o alvo de fato muda, senão qualquer atualização de estado no pai faria
// os quatro números piscarem.

/** Quart out. É a `--ease-dado` do globals.css, escrita como função. */
function quartOut(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

const DUR_ENTRADA = 900;
const DUR_TROCA = 420;

/** O sistema pediu menos movimento? Lido fora do render, nunca durante. */
function querMenosMovimento(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Devolve o valor a EXIBIR, correndo até `alvo`.
 *
 * No servidor e no primeiro quadro devolve o `alvo` final, nunca zero: assim o
 * HTML renderizado já traz o número certo, e quem tem JS desligado, um leitor de
 * tela ou um teste que lê antes da animação vê o valor de verdade em vez de um
 * zero que nunca existiu.
 */
export function useContagem(alvo: number): number {
  const [valor, setValor] = React.useState(alvo);
  // O valor que está na tela agora. Serve de PONTO DE PARTIDA da próxima
  // corrida, que é o que diferencia troca de período de entrada.
  const atual = React.useRef(alvo);
  const primeira = React.useRef(true);

  React.useEffect(() => {
    if (querMenosMovimento()) {
      atual.current = alvo;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValor(alvo);
      return;
    }

    const de = primeira.current ? 0 : atual.current;
    const dur = primeira.current ? DUR_ENTRADA : DUR_TROCA;
    primeira.current = false;

    if (de === alvo) {
      atual.current = alvo;
      return;
    }

    let raf = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / dur);
      const v = Math.round(de + (alvo - de) * quartOut(t));
      atual.current = v;
      setValor(v);
      if (t < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo]);

  return valor;
}
