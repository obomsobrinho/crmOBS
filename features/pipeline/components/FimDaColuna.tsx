"use client";

import { useEffect, useRef } from "react";

/** O marcador do fim de uma coluna: avisa quando aparece. */
export function FimDaColuna({ onVisivel }: { onVisivel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisivel);
  useEffect(() => {
    cb.current = onVisivel;
  });
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin: "200px 0px" }
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} data-slot="pipeline-mais" aria-hidden className="h-px shrink-0" />;
}
