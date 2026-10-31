"use client";

import { useEffect, useRef } from "react";
import type { Circle, CircleMarker, Map as MapaLeaflet, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import { ROTULO_NO_MAPA } from "@/lib/prospeccao";
import type { PontoNoMapa } from "./tipos";

// O MAPA DE CAMPANHAS, um só (revisão do dono, 30/10/2026), usado no detalhe de uma
// busca (os pinos dos leads) e na "Nova busca" (o centro arrastável e o raio).
// Leaflet com os tiles do OpenStreetMap: sem chave, sem custo, com a atribuição que
// a licença pede; no escuro um filtro nos tiles (`.mapa-da-busca`, app/globals.css).
// Os pinos são SVG do Leaflet, coloridos por classe (`pino-{estado}`); o centro é um
// marcador HTML (`.pino-central`) que dá para arrastar.

const RAIO = 7;
const RAIO_DESTACADO = 11;

export default function Mapa({
  pontos = [],
  destaque = null,
  centralizar = false,
  aoEscolher,
  vista,
  area = null,
  aoMoverCentro,
  rotulo,
  className,
  ...props
}: {
  /** Os pinos dos leads. */
  pontos?: PontoNoMapa[];
  /** O lead destacado (o pino cresce e vai para a frente). */
  destaque?: string | null;
  /** O destaque veio de fora do mapa: o mapa vai até o pino. */
  centralizar?: boolean;
  aoEscolher?: (id: string) => void;
  /** Onde o mapa olha quando não há pino nem área (a cidade escolhida). */
  vista?: { lat: number; lng: number; zoom: number } | null;
  /**
   * O centro arrastável e, com `raioKm`, o círculo do raio (null = sem centro). Um centro sem
   * raio é a sede da cidade escolhida: arrastar ou clicar cria a área.
   */
  area?: { lat: number; lng: number; raioKm: number | null } | null;
  /** Arrastar o centro ou clicar no mapa (só com `aoMoverCentro`). */
  aoMoverCentro?: (lat: number, lng: number) => void;
  /** O nome acessível do mapa. */
  rotulo: string;
  className?: string;
} & Record<`data-${string}`, string | number | undefined>) {
  const elemento = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const pinos = useRef(new Map<string, CircleMarker>());
  const centro = useRef<Marker | null>(null);
  const circulo = useRef<Circle | null>(null);
  const escolher = useRef(aoEscolher);
  const mover = useRef(aoMoverCentro);
  useEffect(() => {
    escolher.current = aoEscolher;
    mover.current = aoMoverCentro;
  });

  // Monta o mapa e os pinos (Leaflet mexe no DOM e em `window`: só no navegador).
  useEffect(() => {
    let vivo = true;
    const marcados = pinos.current;
    void import("leaflet").then((L) => {
      if (!vivo || !elemento.current) return;
      leaflet.current = L;
      // A roda sobre o mapa dá zoom NO MAPA (revisão de 30/10/2026); fora dele, a página rola.
      const m = L.map(elemento.current, { scrollWheelZoom: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      m.on("click", (e) => mover.current?.(e.latlng.lat, e.latlng.lng));
      for (const p of pontos) {
        const pino = L.circleMarker([p.lat, p.lng], { radius: RAIO, weight: 2, fillOpacity: 0.9, className: `pino-do-mapa pino-${p.estado}` })
          .bindTooltip(`${p.nome} · ${ROTULO_NO_MAPA[p.estado]}`, { direction: "top", offset: [0, -6] })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            escolher.current?.(p.id);
          })
          .addTo(m);
        marcados.set(p.id, pino);
      }
      if (pontos.length > 0) m.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng])), { padding: [24, 24], maxZoom: 15 });
      else m.setView([-15.8, -47.9], 4);
      mapa.current = m;
      // A primeira vista e a área (os efeitos de baixo rodaram antes do Leaflet chegar).
      desenharArea();
      olharPara();
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      centro.current = null;
      circulo.current = null;
      marcados.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map mounts once per set of pins; area and view have their own effects
  }, [pontos]);

  /** O centro arrastável e o círculo, criados na primeira vez e depois só movidos. */
  function desenharArea() {
    const L = leaflet.current;
    const m = mapa.current;
    if (!L || !m) return;
    if (!area) {
      centro.current?.remove();
      circulo.current?.remove();
      centro.current = null;
      circulo.current = null;
      return;
    }
    const ponto: [number, number] = [area.lat, area.lng];
    if (!centro.current) {
      centro.current = L.marker(ponto, {
        draggable: Boolean(mover.current),
        keyboard: true,
        title: "Centro da busca",
        icon: L.divIcon({ className: "pino-central", iconSize: [22, 22], iconAnchor: [11, 11] }),
      })
        .on("dragend", () => {
          const p = centro.current?.getLatLng();
          if (p) mover.current?.(p.lat, p.lng);
        })
        .addTo(m);
    } else centro.current.setLatLng(ponto);
    if (area.raioKm === null) {
      circulo.current?.remove();
      circulo.current = null;
      m.setView(ponto, Math.max(m.getZoom(), 12), { animate: false });
      return;
    }
    if (!circulo.current) {
      circulo.current = L.circle(ponto, { radius: area.raioKm * 1000, className: "area-do-mapa", weight: 2, fillOpacity: 0.12 }).addTo(m);
    } else circulo.current.setLatLng(ponto).setRadius(area.raioKm * 1000);
    m.fitBounds(circulo.current.getBounds(), { padding: [16, 16], animate: false });
  }

  function olharPara() {
    const m = mapa.current;
    if (!m || area || pontos.length > 0 || !vista) return;
    m.setView([vista.lat, vista.lng], vista.zoom, { animate: false });
  }

  useEffect(() => {
    desenharArea();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw only when the circle changes
  }, [area?.lat, area?.lng, area?.raioKm, area === null]);

  useEffect(() => {
    olharPara();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- move only when the target city changes
  }, [vista?.lat, vista?.lng, vista?.zoom]);

  // O destaque: o pino cresce e vai para a frente; vindo de fora, o mapa vai até ele.
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

  return (
    <div
      ref={elemento}
      role="img"
      aria-label={rotulo}
      className={cn("mapa-da-busca relative z-0 overflow-hidden rounded-lg border border-line", className)}
      {...props}
    />
  );
}
