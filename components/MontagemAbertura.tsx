"use client";

import { Monitor } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { coresDoPasso, VISUAL_DO_PASSO } from "./montagem-visual";
import { AVISO_COMPUTADOR, PASSOS_MONTAGEM } from "@/lib/onboarding";

// A ABERTURA da montagem (23/10/2026, dono): antes do passo 1, o mapa dos cinco
// passos e a frase do computador. Até aqui ninguém sabia, antes de chegar ao
// passo 4, que ele pede um computador: o aviso só aparecia lá, no celular,
// depois de a pessoa ter investido tudo. Dos oito cadastros de testadores, cinco
// configuraram e pararam no passo 4.
//
// ⚠️ Sem tempo estimado, por decisão do dono: uma conta só chegou ao fim, e é
// pouco dado para prometer um tempo.
//
// ⚠️ Não é um passo a mais. O contador "Passo X de 5" não aparece aqui, e a
// abertura some quando a pessoa já começou (rascunho no navegador ou agente
// configurado no servidor).

export default function MontagemAbertura({ celular }: { celular: boolean }) {
  return (
    <div data-slot="montagem-abertura">
      <h1 className="text-titulo">Vamos montar o seu agente</h1>
      <p className="mt-1.5 text-apoio text-ink-2">
        São cinco passos. Nada vai ao ar antes de você ativar, no último.
      </p>

      <ol className="mt-6">
        {PASSOS_MONTAGEM.map((p, i) => {
          const Icone = VISUAL_DO_PASSO[p.key].icone;
          const c = coresDoPasso(p.key);
          return (
            <li
              key={p.key}
              data-slot="abertura-passo"
              data-passo={p.key}
              className="relative flex gap-3 pb-5 last:pb-0"
            >
              {i < PASSOS_MONTAGEM.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-11 bottom-1 left-[19px] w-px bg-line-strong"
                />
              )}
              <span
                data-slot="abertura-icone"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: c.fill, color: c.on }}
              >
                <Icone size={19} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="flex items-center gap-2 text-rotulo uppercase text-ink-3">
                  Passo {i + 1}
                  {/* O pedido de ajuda é o diferencial: a mesma etiqueta dos
                      destaques da montagem. */}
                  {p.key === "avisos" && (
                    <span data-slot="abertura-faz-diferenca" className="text-brand-ink">
                      Faz diferença
                    </span>
                  )}
                </p>
                <p className="text-corpo font-semibold text-ink">{p.titulo}</p>
                <p className="mt-0.5 text-apoio text-ink-2">{p.resumo}</p>
                {/* O ALERTA DO COMPUTADOR MORA NO PASSO 4 DO MAPA (23/10/2026,
                    dono): é dele que ele fala. Ficava solto no pé da abertura. */}
                {p.key === "conectar" && (
                  <Aviso icone={Monitor} data-slot="abertura-computador" className="mt-2">
                    {AVISO_COMPUTADOR}
                    {/* No celular dá para fazer os três primeiros: o agente fica
                        salvo no servidor ao sair do passo 2, e no computador a
                        montagem abre no 4. */}
                    {celular &&
                      " Você está no celular: dá para fazer os três primeiros passos aqui e terminar no computador."}
                  </Aviso>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
