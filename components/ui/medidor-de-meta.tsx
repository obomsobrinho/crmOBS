import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Medidor de META COM RITMO (16/10/2026, referência do dono): a barra de progresso contra uma meta. Uma trilha
 * só, na tinta clara do estado; o uso é o preenchimento sólido; o ponto do ritmo ideal de hoje (`marcador`) é
 * uma bolinha SOBRE a trilha; e o trecho entre o uso e a bolinha é listrado na diagonal. A cor segue o RITMO
 * (gasto, então menos é melhor): `estado="bom"` (no ou abaixo do ritmo, verde) ou `"ruim"` (acima, vermelho).
 * Quem usa decide o estado (a regra mora em `lib/custo-ia.ts`, `posicaoNoRitmo`) e escreve a frase do ritmo
 * embaixo: a cor nunca é a única pista.
 *
 * Era um ramo dentro de `Medidor`; o medidor fino (`components/ui/medidor.tsx`) ficou só com a barra simples.
 * `valor` e `marcador` são porcentagens (0 a 100, cortadas nas pontas). Com `rotulo`, é um `meter`
 * acessível; sem ele, é decorativo (`aria-hidden`).
 */
const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

function MedidorDeMeta({
  className,
  valor,
  marcador,
  estado = "bom",
  rotulo,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  /** O uso, em % da meta (0 a 100). */
  valor: number;
  /** O ritmo ideal de hoje, em % (0 a 100): vira a bolinha e o trecho listrado. */
  marcador: number;
  /** `bom` (no ou abaixo do ritmo, verde) ou `ruim` (acima, vermelho). */
  estado?: "bom" | "ruim";
  rotulo?: string;
}) {
  const largura = clamp(valor);
  const ponto = clamp(marcador);
  const de = Math.min(largura, ponto);
  const ate = Math.max(largura, ponto);
  const acima = largura > ponto;
  const cor = estado === "bom" ? "var(--human-fill)" : "var(--danger-fill)";
  const acessivel = rotulo
    ? {
        role: "meter" as const,
        "aria-label": rotulo,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(largura),
      }
    : { "aria-hidden": true };
  return (
    <span
      {...props}
      {...acessivel}
      data-slot="medidor-de-meta"
      data-estado={estado}
      className={cn(
        "relative block h-3 w-full rounded-full",
        estado === "bom" ? "bg-human-surface" : "bg-danger-surface",
        className
      )}
    >
      {/* O preenchimento e o trecho listrado ficam cortados na trilha; a bolinha passa por cima, fora do corte. */}
      <span aria-hidden className="absolute inset-0 block overflow-hidden rounded-full">
        <span
          data-medidor-cheio=""
          className={cn("absolute inset-y-0 left-0 block", estado === "bom" ? "bg-human" : "bg-danger")}
          style={{ width: `${largura}%` }}
        />
        {ate > de && (
          <span
            data-medidor-trecho=""
            data-sobre-o-cheio={acima || undefined}
            className="absolute inset-y-0 block"
            style={{
              left: `${de}%`,
              width: `${ate - de}%`,
              // Abaixo do ritmo o trecho vazio leva listras da cor do estado; acima, o excesso leva listras
              // claras sobre o preenchimento (o mesmo desenho, legível nas duas direções).
              backgroundImage: `repeating-linear-gradient(135deg, ${
                acima ? "color-mix(in srgb, var(--raised) 60%, transparent)" : `color-mix(in srgb, ${cor} 65%, transparent)`
              } 0 2.5px, transparent 2.5px 6px)`,
            }}
          />
        )}
      </span>
      <span
        aria-hidden
        data-medidor-marcador=""
        className="absolute top-1/2 block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-raised bg-ink"
        style={{ left: `${ponto}%` }}
      />
    </span>
  );
}

export { MedidorDeMeta };
