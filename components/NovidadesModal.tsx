"use client";

import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { CHAVE_DA_NOVIDADE_VISTA, notaAtual, type Novidade } from "@/lib/novidades";

// O DIÁLOGO DE NOVIDADES (27/10/2026, dono): uma vez por usuário, só para quem
// já tinha conta antes da nota. QUEM vê é decidido no servidor (layout de
// `app/(app)`, `novidadeParaMostrar`); aqui só se mostra e se grava o "já vi".
//
// Gravar: `user_metadata.novidades_vista` = id da nota, e depois renovar a
// sessão. Sem renovar, o JWT do cookie continuaria com o metadado antigo e o
// layout (que lê do JWT) mostraria a nota de novo na próxima navegação.
//
// SÓ EM DESENVOLVIMENTO, para o dono validar o texto:
// - `?novidades=ver` mostra a nota atual para qualquer conta, e fechar NÃO grava.
// - `?novidades=zerar` apaga o "já vi" deste usuário (a regra volta a decidir).

const EM_DEV = process.env.NODE_ENV !== "production";

export default function NovidadesModal({
  nota,
  simular = false,
}: {
  nota: Novidade | null;
  /** Preview `/design/novidades`: fecha sem gravar nada. */
  simular?: boolean;
}) {
  const [forcada, setForcada] = useState<Novidade | null>(null);
  const [fechada, setFechada] = useState<string | null>(null);

  useEffect(() => {
    if (!EM_DEV || simular) return;
    const pedido = new URLSearchParams(window.location.search).get("novidades");
    void (async () => {
      if (pedido === "ver") setForcada(notaAtual());
      if (pedido === "zerar") {
        const supabase = createClient();
        await supabase.auth.updateUser({ data: { [CHAVE_DA_NOVIDADE_VISTA]: null } });
        await supabase.auth.refreshSession();
      }
    })();
  }, [simular]);

  const mostrar = forcada ?? nota;
  const aberta = !!mostrar && fechada !== mostrar.id;

  function fechar() {
    if (!mostrar) return;
    setFechada(mostrar.id);
    if (simular || forcada) return;
    // Fecha na hora; gravar é em segundo plano. Se falhar, a nota volta no
    // próximo login, o que é melhor do que prender a pessoa no diálogo.
    void (async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
          data: { [CHAVE_DA_NOVIDADE_VISTA]: mostrar.id },
        });
        if (error) throw error;
        await supabase.auth.refreshSession();
      } catch (e) {
        console.error("novidades: não gravou o já vi:", e);
      }
    })();
  }

  if (!mostrar) return null;

  // Desenho pelas referências do dono (27/10/2026): topo colorido com o foguete
  // subindo entre nuvens, corpo claro com título centralizado, cada novidade
  // num ponto com título e uma linha, e UMA ação no rodapé, depois de um fio.
  return (
    <Dialog open={aberta} onOpenChange={(v) => !v && fechar()}>
      <DialogContent tamanho="novidade" data-slot="novidades" data-nota={mostrar.id}>
        <IlustracaoDoFoguete />
        {/* `-mt-px`: cobre o fio de meio pixel que o navegador deixa entre o fim
            do SVG e o corpo (as duas cores são a mesma, `--raised`). */}
        <div className="relative -mt-px flex flex-col items-center bg-raised px-6 pb-5 text-center">
          <BrandMark size="sm" />
          <DialogTitle className="mt-3 font-bold" style={{ textWrap: "balance" }}>
            {mostrar.titulo}
          </DialogTitle>
          <DialogDescription className="mt-1">{mostrar.resumo}</DialogDescription>
          <ul className="mt-5 flex w-full flex-col gap-3 text-left">
            {mostrar.itens.map((i) => (
              <li key={i.titulo} data-slot="novidades-item" className="flex gap-3">
                <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[var(--brand-fill)]" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-apoio font-semibold text-ink">{i.titulo}</span>
                  <span className="text-apoio text-ink-2" style={{ textWrap: "pretty" }}>
                    {i.texto}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-line-soft">
          <Button
            data-slot="novidades-fechar"
            variant="brand-ghost"
            size="linha"
            onClick={fechar}
            className="w-full justify-center rounded-none font-semibold"
          >
            Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O topo do diálogo, em SVG na página (nenhuma imagem de fora): o degradê da
 * marca (`--brand-fill` até `--brand-grad-end`, o uso que o token permite: superfície
 * decorativa), estrelas e anéis em `--brand-on`, o foguete subindo e as nuvens.
 * A nuvem da frente é pintada com `--raised`, a cor do corpo do diálogo, então ela
 * "vira" o corpo nos dois temas, como nas referências.
 */
function IlustracaoDoFoguete() {
  return (
    <svg
      viewBox="0 0 384 172"
      aria-hidden
      data-slot="novidades-ilustracao"
      className="block h-auto w-full"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="novidades-ceu" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand-fill)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-grad-end)" }} />
        </linearGradient>
        <linearGradient id="novidades-rastro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand-on)", stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: "var(--brand-on)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      <rect width="384" height="172" fill="url(#novidades-ceu)" />
      <circle cx="0" cy="0" r="58" fill="none" style={{ stroke: "var(--brand-on)" }} strokeOpacity="0.12" strokeWidth="18" />
      <circle cx="384" cy="10" r="46" fill="none" style={{ stroke: "var(--brand-on)" }} strokeOpacity="0.12" strokeWidth="16" />
      {[
        [96, 40, 2.6],
        [292, 34, 2.2],
        [318, 82, 2.8],
        [70, 92, 1.8],
        [250, 60, 1.6],
        [140, 22, 1.6],
      ].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} style={{ fill: "var(--brand-on)" }} fillOpacity="0.8" />
      ))}

      {/* Nuvens de trás, translúcidas: dão a profundidade do céu. */}
      <g style={{ fill: "var(--brand-on)" }} fillOpacity="0.22">
        <circle cx="40" cy="150" r="44" />
        <circle cx="112" cy="146" r="30" />
        <circle cx="284" cy="146" r="30" />
        <circle cx="350" cy="148" r="44" />
      </g>

      <g className="anim-foguete">
        <rect x="185" y="118" width="14" height="52" rx="7" fill="url(#novidades-rastro)" />
        <path
          d="M192 34c13 10 19 28 19 50v34h-38V84c0-22 6-40 19-50z"
          style={{ fill: "var(--brand-on)" }}
        />
        <path d="M173 94l-13 17v12l13-6z" style={{ fill: "var(--brand-on)" }} fillOpacity="0.85" />
        <path d="M211 94l13 17v12l-13-6z" style={{ fill: "var(--brand-on)" }} fillOpacity="0.85" />
        <circle cx="192" cy="74" r="10" style={{ fill: "var(--brand-grad-end)", stroke: "var(--brand-fill)" }} strokeWidth="3" />
        <rect x="181" y="118" width="22" height="6" rx="3" style={{ fill: "var(--brand-on)" }} fillOpacity="0.7" />
      </g>

      {/* Nuvem da frente: a cor do corpo do diálogo. */}
      <g style={{ fill: "var(--raised)" }}>
        <circle cx="18" cy="182" r="40" />
        <circle cx="82" cy="170" r="32" />
        <circle cx="140" cy="176" r="28" />
        <circle cx="192" cy="168" r="22" />
        <circle cx="244" cy="176" r="28" />
        <circle cx="302" cy="170" r="32" />
        <circle cx="366" cy="182" r="40" />
        <rect x="0" y="164" width="384" height="8" />
      </g>
    </svg>
  );
}
