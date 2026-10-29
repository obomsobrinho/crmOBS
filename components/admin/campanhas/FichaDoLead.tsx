"use client";

import { Check, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { numeroBR } from "@/lib/format";
import {
  ROTULO_DO_ANGULO,
  ROTULO_DO_ITEM,
  anguloDaAbordagem,
  resumoDoSite,
  tipoDoTelefone,
  type Oferta,
} from "@/lib/prospeccao";
import { SeloDaPontuacao } from "./pecas";
import type { ConfigDaCampanha, EmpresaAchada } from "./tipos";

// A FICHA DO LEAD: tudo o que a busca e o raio-X acharam da empresa, o lado
// "tem" e o "falta" da auditoria do site, a oferta escolhida e as objeções da
// campanha. O mesmo bloco é o que o plano propõe no painel lateral da conversa
// (seção 7, "Resposta"), para quem atende ver de onde o lead veio.

export default function FichaDoLead({
  empresa,
  ofertas,
  objecoes,
  aoFechar,
}: {
  empresa: EmpresaAchada | null;
  ofertas: Oferta[];
  objecoes: ConfigDaCampanha["objecoes"];
  aoFechar: () => void;
}) {
  const site = empresa?.sinais.site;
  const angulo = empresa ? anguloDaAbordagem(empresa.sinais, ofertas) : null;
  return (
    <Sheet open={empresa !== null} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent aria-describedby={undefined} data-slot="ficha-do-lead">
        {empresa && site && angulo && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div className="min-w-0">
                <SheetTitle>{empresa.nome}</SheetTitle>
                <SheetDescription className="mt-1">
                  {empresa.segmento}, {empresa.bairro}, {empresa.cidade}
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button variant="ghost" size="icon-control" aria-label="Fechar">
                  <X size={16} />
                </Button>
              </SheetClose>
            </div>
            <AreaRolavel className="min-h-0 flex-1 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <SeloDaPontuacao sinais={empresa.sinais} />
                <span className="text-apoio text-ink-2">
                  {empresa.nota !== null
                    ? `Nota ${numeroBR(empresa.nota)} com ${numeroBR(empresa.avaliacoes ?? 0)} avaliações no Google`
                    : "Sem avaliações no Google"}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-apoio">
                <dt className="text-ink-3">Telefone</dt>
                <dd className="text-ink">
                  {tipoDoTelefone(empresa.telefone) === "celular" ? "Celular" : "Sem celular válido"}
                </dd>
                <dt className="text-ink-3">Horário</dt>
                <dd className="text-ink">{empresa.horario}</dd>
                <dt className="text-ink-3">Site</dt>
                <dd className="text-ink">{empresa.site ?? "Nenhum"}</dd>
              </dl>

              <h3 className="mt-5 text-cartao">Oferta</h3>
              <p className="mt-1 text-apoio text-ink-2" data-slot="ficha-angulo">
                <span className="font-semibold text-ink">
                  {angulo.temGancho ? ROTULO_DO_ANGULO[angulo.angulo] : "Sem gancho claro"}.
                </span>{" "}
                {angulo.porque}.
              </p>

              <h3 className="mt-5 text-cartao">Auditoria do site</h3>
              <p className="mt-1 text-apoio text-ink-2">{resumoDoSite(site)}.</p>
              {site.classe === "com_falhas" || site.classe === "bom" ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2" data-slot="ficha-auditoria">
                  <div>
                    <p className="text-rotulo uppercase text-ink-3">Tem</p>
                    <ul className="mt-1 flex flex-col gap-1 text-apoio text-ink">
                      {site.tem.map((i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <Check size={14} className="shrink-0 text-ink-3" aria-hidden />
                          {ROTULO_DO_ITEM[i]}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-rotulo uppercase text-ink-3">Falta</p>
                    {site.falta.length === 0 ? (
                      <p className="mt-1 text-apoio text-ink-2">Nada da lista.</p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1 text-apoio text-warn-ink">
                        {site.falta.map((i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Minus size={14} className="shrink-0" aria-hidden />
                            {ROTULO_DO_ITEM[i]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              <h3 className="mt-5 text-cartao">Objeções da campanha</h3>
              <ul className="mt-2 flex flex-col gap-2.5">
                {objecoes.map((o, i) => (
                  <li key={i} className="text-apoio">
                    <p className="font-semibold text-ink">“{o.objecao}”</p>
                    <p className="text-ink-2">{o.resposta}</p>
                  </li>
                ))}
              </ul>
            </AreaRolavel>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
