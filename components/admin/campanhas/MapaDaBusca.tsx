"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as MapaLeaflet } from "leaflet";
import "leaflet/dist/leaflet.css";
import { numeroBR } from "@/lib/format";
import { ROTULO_NO_MAPA, type EstadoNoMapa } from "@/lib/prospeccao";
import type { PontoNoMapa } from "./tipos";

// O MAPA DE UMA BUSCA (revisão do dono, 30/10/2026): um pino por lead, na cor do
// estado (não contatado, bom, contatado, respondeu, descartado; as cores são os
// tokens `--mapa-*` de app/globals.css, claro e escuro). Leaflet com os tiles do
// OpenStreetMap: sem chave, sem custo, com a atribuição que a licença pede. Clicar
// num pino leva a tabela até o lead; "ver no mapa" na tabela destaca o pino. O
// texto de tudo isto é a tabela; o mapa é a vista. Desenhar uma área para buscar
// fica para depois (plano, seção 6).

export const ESTADOS_NO_MAPA: EstadoNoMapa[] = ["nao_contatado", "bom", "contatado", "respondeu", "descartado"];

const RAIO = 7;
const RAIO_DESTACADO = 11;

export default function MapaDaBusca({
  pontos,
  destaque,
  centralizar,
  aoEscolher,
}: {
  pontos: PontoNoMapa[];
  /** O lead destacado (o pino fica maior e vai para a frente). */
  destaque: string | null;
  /** O destaque veio da tabela: o mapa vai até o pino. */
  centralizar: boolean;
  aoEscolher: (id: string) => void;
}) {
  const elemento = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const pinos = useRef(new Map<string, CircleMarker>());
  const escolher = useRef(aoEscolher);
  useEffect(() => {
    escolher.current = aoEscolher;
  });

  // Monta o mapa e os pinos (Leaflet mexe no DOM e em `window`: só no navegador).
  useEffect(() => {
    let vivo = true;
    const marcados = pinos.current;
    void import("leaflet").then((L) => {
      if (!vivo || !elemento.current) return;
      const m = L.map(elemento.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      for (const p of pontos) {
        const pino = L.circleMarker([p.lat, p.lng], {
          radius: RAIO,
          weight: 2,
          fillOpacity: 0.9,
          className: `pino-do-mapa pino-${p.estado}`,
        })
          .bindTooltip(`${p.nome} · ${ROTULO_NO_MAPA[p.estado]}`, { direction: "top", offset: [0, -6] })
          .on("click", () => escolher.current(p.id))
          .addTo(m);
        marcados.set(p.id, pino);
      }
      if (pontos.length > 0) m.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng])), { padding: [24, 24], maxZoom: 15 });
      else m.setView([-15.8, -47.9], 4);
      mapa.current = m;
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcados.clear();
    };
  }, [pontos]);

  // O destaque: o pino cresce e vai para a frente; vindo da tabela, o mapa vai até ele.
  useEffect(() => {
    for (const [id, pino] of pinos.current) {
      const ativo = id === destaque;
      pino.setRadius(ativo ? RAIO_DESTACADO : RAIO);
      pino.setStyle({ weight: ativo ? 3 : 2 });
      if (ativo) {
        pino.bringToFront();
        pino.openTooltip();
        if (centralizar) mapa.current?.panTo(pino.getLatLng());
      } else pino.closeTooltip();
    }
  }, [destaque, centralizar, pontos]);

  const contagem = (e: EstadoNoMapa) => pontos.filter((p) => p.estado === e).length;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={elemento}
        role="img"
        aria-label={`Mapa com ${numeroBR(pontos.length)} leads desta busca`}
        className="mapa-da-busca relative z-0 h-80 overflow-hidden rounded-lg border border-line"
        data-slot="busca-mapa"
        data-pinos={pontos.length}
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-legenda text-ink-2" data-slot="busca-mapa-legenda">
        {ESTADOS_NO_MAPA.map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span aria-hidden className={`legenda-do-mapa pino-${e} size-2.5 rounded-full`} />
            {ROTULO_NO_MAPA[e]}
            <span className="tabular-nums text-ink-3">{numeroBR(contagem(e))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
