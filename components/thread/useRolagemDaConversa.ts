"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Bubble } from "@/lib/types";

/**
 * A rolagem da conversa: abre no fim, acompanha mensagem nova só quando a pessoa
 * já está no fim e fica grudada no fim enquanto a mídia carrega.
 */
export function useRolagemDaConversa({
  viewportRef,
  phone,
  bubbles,
  pendentes,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  phone: string;
  bubbles: Bubble[];
  /** Quantos envios pendentes: subiu, a pessoa acabou de mandar. */
  pendentes: number;
}) {
  const phoneRef = useRef(phone);
  // Se a pessoa está no fim da conversa. Quem escreve é o efeito que ouve a
  // rolagem (mais abaixo); quem lê é o efeito que rola quando chega mensagem.
  const grudadoRef = useRef(true);
  const pendentesRef = useRef(0);

  // Ao trocar de conversa, pula pro fim sem animar; mensagens novas na mesma
  // conversa rolam suave.
  //
  // Rola o VIEWPORT direto, em vez de `bottomRef.scrollIntoView()`. Motivo
  // medido: o scrollIntoView precisa encontrar um ancestral rolável no instante
  // em que o efeito roda, e o Radix ainda não aplicou o layout do viewport
  // (o wrapper interno é `display: table`, injetado por ele na montagem). O
  // resultado era a conversa abrindo no TOPO em vez de na última mensagem.
  // O rAF garante que a medida acontece depois da pintura.
  //
  // ⚠️ SÓ ROLA SOZINHO QUANDO A PESSOA JÁ ESTÁ NO FIM (achado do dono,
  // 30/09/2026, com vídeo: "rolo a primeira vez e funciona, depois fica
  // invertido"). Antes, QUALQUER recarga da lista (tempo real, voltar o foco)
  // levava ao fim, e quem estava lendo o histórico era puxado para baixo no meio
  // da rolagem. Agora rola só ao trocar de conversa, quando quem está lendo já
  // estava no fim, ou quando a própria pessoa mandou a mensagem (pendente nova).
  // Fora disso, a seta "tem mais embaixo" já avisa, como no WhatsApp Web.
  useEffect(() => {
    const trocou = phoneRef.current !== phone;
    const behavior: ScrollBehavior = trocou ? "auto" : "smooth";
    phoneRef.current = phone;
    const mandou = pendentes > pendentesRef.current;
    pendentesRef.current = pendentes;
    if (trocou) grudadoRef.current = true;
    if (!trocou && !mandou && !grudadoRef.current) return;
    const id = requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      // ⚠️ A medida que existia aqui SAIU com as sombras: quem mede agora é o
      // próprio `ScrollArea`, e ele já faz isso na montagem e a cada mudança de
      // tamanho do conteúdo (`ResizeObserver`), justamente para a máscara não
      // nascer errada antes do primeiro evento de rolagem.
    });
    return () => cancelAnimationFrame(id);
    // `pending` é lido só para saber se a pessoa acabou de mandar; ele já
    // muda `bubbles`, então não dispara nada a mais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles, phone]);

  // ⚠️ GRUDADO NO FIM ENQUANTO A CONVERSA CARREGA (23/09/2026, achado no
  // celular). A rolagem acima acontece UMA vez, na primeira pintura, e depois
  // disso o conteúdo ainda cresce: imagem e áudio chegam por URL assinada, a
  // faixa "O cliente quer" aparece depois da consulta e encolhe a área. Medido
  // numa conversa com mídia: abria 444px antes da última mensagem, e a pessoa
  // tinha que rolar ou tocar na seta. Aqui, qualquer mudança de tamanho (da
  // área ou do conteúdo) devolve ao fim, ATÉ a pessoa rolar para cima por conta
  // própria: aí ela está lendo o histórico e puxar de volta seria brigar com ela.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let grudado = true;
    grudadoRef.current = true;
    // Onde o fim estava da última vez que grudamos. ⚠️ Não basta ouvir o evento
    // de rolagem: quando alguém rola para cima, o conteúdo pode mudar de tamanho
    // (a barra do Radix aparece) e o observador disparar ANTES do evento, e aí
    // a conversa era puxada de volta para o fim. Comparar com a posição guardada
    // percebe a subida mesmo nessa ordem.
    let topoFim = el.scrollTop;
    const noFim = () => el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    const aoRolar = () => {
      grudado = noFim();
      grudadoRef.current = grudado;
      if (grudado) topoFim = el.scrollTop;
    };
    const observador = new ResizeObserver(() => {
      if (!grudado) return;
      if (el.scrollTop < topoFim - 4 && !noFim()) {
        grudado = false;
        grudadoRef.current = false;
        return;
      }
      el.scrollTop = el.scrollHeight;
      topoFim = el.scrollTop;
    });
    observador.observe(el);
    if (el.firstElementChild) observador.observe(el.firstElementChild);
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      observador.disconnect();
      el.removeEventListener("scroll", aoRolar);
    };
  }, [phone, viewportRef]);
}
