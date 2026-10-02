"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { urlAssinadaDaMidia, urlGuardadaDaMidia } from "@/lib/midia-url";

// Renderiza a mídia da mensagem (imagem/áudio/vídeo/documento). O bucket
// whatsapp-media é privado: quando media_url é um caminho do Storage, resolve
// para uma URL assinada temporária (RLS por tenant). Se já for uma URL http
// (compatibilidade), usa direto.
export function MediaView({ url, type }: { url: string; type: string | null }) {
  const isHttp = /^https?:\/\//.test(url);
  // Nasce pronto quando a URL já foi assinada antes (lib/midia-url.ts).
  const [resolved, setResolved] = useState<string | null>(
    isHttp ? url : urlGuardadaDaMidia(url)
  );

  useEffect(() => {
    // http já vem resolvido pelo estado inicial; só resolve caminho do Storage.
    // As assinaturas dos balões que montam juntos saem em UMA chamada, e a URL
    // fica guardada (R-23, lib/midia-url.ts).
    if (isHttp) return;
    let cancelled = false;
    void urlAssinadaDaMidia(url).then((assinada) => {
      if (!cancelled) setResolved(assinada);
    });
    return () => {
      cancelled = true;
    };
  }, [url, isHttp]);

  if (!resolved) {
    return (
      <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-ink/5 px-2.5 py-2 text-apoio text-ink-2">
        <FileText size={15} /> carregando mídia…
      </div>
    );
  }

  if (type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt="Imagem"
        loading="lazy"
        decoding="async"
        className="mb-1 max-h-64 w-auto rounded-lg object-cover"
      />
    );
  }
  if (type === "audio") {
    return <audio controls preload="none" src={resolved} className="mb-1 w-56 max-w-full" />;
  }
  if (type === "video") {
    return <video controls preload="metadata" src={resolved} className="mb-1 max-h-64 rounded-lg" />;
  }
  return (
    <a
      href={resolved}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 flex items-center gap-1.5 rounded-lg bg-ink/5 px-2.5 py-2 text-apoio font-medium underline"
    >
      <FileText size={15} /> Abrir arquivo
    </a>
  );
}
