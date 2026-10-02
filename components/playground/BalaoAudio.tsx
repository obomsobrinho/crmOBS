"use client";

import { useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { PELE_CLIENTE, mmss } from "./apoio";

/** Balão de mensagem de voz, do lado de quem mandou. Toca o próprio áudio. */
export function BalaoAudio({ url, segundos }: { url: string; segundos: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  return (
    <div
      data-slot="balao-audio"
      className={cn(
        "flex items-center gap-2.5 rounded-[16px_4px_16px_16px] border py-2 pr-3.5 pl-2",
        PELE_CLIENTE
      )}
    >
      {/* eslint-disable-next-line no-restricted-syntax -- o variant brand do Button acrescenta hover brightness e shrink-0 que este botão não tem */}
      <button
        type="button"
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) void a.play();
          else a.pause();
        }}
        className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
        aria-label={tocando ? "Pausar áudio" : "Ouvir áudio"}
      >
        {tocando ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <Mic size={14} aria-hidden />
      <span className="text-apoio tabular-nums">{mmss(segundos)}</span>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => setTocando(false)}
        className="hidden"
      />
    </div>
  );
}
