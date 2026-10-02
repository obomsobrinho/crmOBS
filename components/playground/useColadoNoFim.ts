"use client";

import { useEffect, useRef } from "react";

/** A área de mensagens: `scrollDown` leva ao fim e ela acompanha o conteúdo. */
export function useColadoNoFim() {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Colado no fim enquanto a pessoa não subir para reler.
  const coladoRef = useRef(true);
  const scrollDown = () => {
    coladoRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // ⚠️ A ÚLTIMA MENSAGEM SEMPRE À VISTA (29/09/2026, pedido do dono). O
  // `scrollDown` dos gestos não bastava: a caixa do pedido de ajuda é mais alta
  // que a do cliente e encolhe a conversa DEPOIS da rolagem, e os balões chegam
  // um a um. Então qualquer mudança de tamanho (da área ou do conteúdo) volta
  // ao fim, desde que a pessoa não tenha subido para reler.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const aoFim = () => {
      if (coladoRef.current) el.scrollTop = el.scrollHeight;
    };
    const aoRolar = () => {
      coladoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const tamanho = new ResizeObserver(aoFim);
    tamanho.observe(el);
    const conteudo = new MutationObserver(aoFim);
    conteudo.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      tamanho.disconnect();
      conteudo.disconnect();
      el.removeEventListener("scroll", aoRolar);
    };
  }, []);

  return { scrollRef, scrollDown };
}
