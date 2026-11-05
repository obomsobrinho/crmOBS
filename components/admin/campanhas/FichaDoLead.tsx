"use client";

import { useState } from "react";
import { AtSign, Clock, Globe, Image as Foto, MapPin, Phone, ShieldAlert, ShieldCheck, Star, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Input } from "@/components/ui/input";
import { Medidor } from "@/components/ui/medidor";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { mascaraTelefoneBR, numeroBR, pct } from "@/lib/format";
import {
  DIAS_DA_SEMANA,
  faixaDaPontuacao,
  ganchosDoHorario,
  leadSemHistorico,
  pontuacaoExibida,
  problemaDoCelular,
  textoDoDia,
  textosDosGanchos,
  situacaoDoTelefone,
  tipoDoTelefone,
} from "@/lib/prospeccao";
import { DA_FAIXA, TextoDoSite } from "./pecas";
import { sinaisDoLead, type FonteDeCampanhas, type LeadDaTabela } from "./tipos";

// A FICHA DE UM LEAD (revisão do dono, 30/10/2026): o que a fonte trouxe além da
// linha da tabela. A pontuação com os motivos; o perfil do Google reivindicado
// ou não (sinal de presença digital fraca); o horário, com os ganchos do
// atendimento fora do horário (fecha cedo, não abre sábado, fecha no almoço); as
// avaliações por estrela; fotos, categorias, endereço e o @ do Instagram. O telefone
// é o único campo editável (dono, 05/11/2026): um celular achado em outro lugar põe o
// lead em condição de entrar numa campanha.

function Linha({ icone: Icone, rotulo, children }: { icone: typeof Phone; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icone size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <dt className="text-legenda text-ink-3">{rotulo}</dt>
        <dd className="mt-0.5 text-apoio text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** O telefone do lead e, para quem não tem histórico, adicionar ou trocar o celular. */
function TelefoneDoLead({
  lead,
  fonte,
  comecarEditando,
  aoSalvar,
}: {
  lead: LeadDaTabela;
  fonte: FonteDeCampanhas;
  comecarEditando: boolean;
  aoSalvar: (telefone: string) => void;
}) {
  const podeEditar = leadSemHistorico({ parouEm: lead.parouEm, campanhas: lead.campanhas.length });
  const [editando, setEditando] = useState(comecarEditando && podeEditar);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const problema = problemaDoCelular(valor);
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    try {
      const r = await fonte.editarTelefone(lead.id, valor);
      if (r.ok) {
        aoSalvar(r.telefone);
        setEditando(false);
        setValor("");
      } else setErro(r.erro);
    } catch (e) {
      console.error("lead, editar telefone:", e);
      setErro("Não deu para salvar agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <form
        noValidate
        className="flex flex-col gap-2"
        data-slot="lead-telefone-form"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Input
          autoFocus
          inputMode="tel"
          placeholder="(33) 90000-0000"
          aria-label={`Celular de ${lead.nome}`}
          value={valor}
          onChange={(e) => setValor(mascaraTelefoneBR(e.target.value))}
          data-slot="lead-telefone-campo"
        />
        {erro && (
          <p role="alert" className="text-legenda text-danger-ink" data-slot="lead-telefone-erro">
            {erro}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="control" carregando={salvando} data-slot="lead-telefone-salvar">
            Salvar
          </Button>
          <Button type="button" variant="outline" size="control" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  const situacao = situacaoDoTelefone(lead.telefone);
  return (
    <>
      {lead.telefone ? (
        <>
          {mascaraTelefoneBR(lead.telefone)}
          {situacao !== "celular" && (
            <span className="ml-2 text-legenda text-warn-ink">{tipoDoTelefone(lead.telefone) === "fixo" ? "Fixo, não entra em campanha" : "Inválido"}</span>
          )}
        </>
      ) : (
        <span className="text-ink-3">Sem telefone</span>
      )}
      {podeEditar && (
        <Button variant="link" size="link" onClick={() => setEditando(true)} className="block" data-slot="lead-telefone-editar">
          {situacao === "celular" ? "Trocar o celular" : "Adicionar celular"}
        </Button>
      )}
    </>
  );
}

export default function FichaDoLead({
  lead,
  fonte,
  editarTelefone = false,
  aoFechar,
  aoSalvarTelefone,
}: {
  lead: LeadDaTabela | null;
  fonte: FonteDeCampanhas;
  /** A ficha abriu pelo lápis da tabela: já começa no campo do telefone. */
  editarTelefone?: boolean;
  aoFechar: () => void;
  aoSalvarTelefone: (telefone: string) => void;
}) {
  const d = lead?.detalhes ?? null;
  const ganchos = textosDosGanchos(ganchosDoHorario(d?.horarios));
  const pontos = lead ? pontuacaoExibida(sinaisDoLead(lead), lead.pontuacao) : null;
  const totalDasNotas = d?.distribuicao ? Object.values(d.distribuicao).reduce((a, b) => a + b, 0) : 0;
  return (
    <Sheet open={lead !== null} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent data-slot="lead-ficha">
        {lead && (
          <AreaRolavel className="min-h-0 flex-1">
            <div className="flex flex-col gap-6 px-6 pb-6 pt-6">
              <div>
                <SheetTitle className="text-titulo">{lead.nome}</SheetTitle>
                <SheetDescription className="mt-1 text-apoio text-ink-2">
                  {[lead.segmento, [lead.bairro, lead.cidade].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </SheetDescription>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {pontos && (
                    <Badge variant={DA_FAIXA[faixaDaPontuacao(pontos.pontos)]} className="tabular-nums" data-slot="ficha-pontos">
                      {pontos.pontos} pontos
                    </Badge>
                  )}
                  {d?.reivindicado === false && (
                    <Badge variant="estado-aviso" data-slot="ficha-nao-reivindicado">
                      Perfil não reivindicado
                    </Badge>
                  )}
                  {ganchos.map((g) => (
                    <Badge key={g} variant="contorno">
                      {g}
                    </Badge>
                  ))}
                </div>
                {pontos && pontos.motivos.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-legenda text-ink-2" data-slot="ficha-motivos">
                    {pontos.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>

              <dl className="flex flex-col gap-4 border-t border-line pt-5">
                <Linha icone={Phone} rotulo="Telefone">
                  <TelefoneDoLead key={lead.id} lead={lead} fonte={fonte} comecarEditando={editarTelefone} aoSalvar={aoSalvarTelefone} />
                </Linha>
                <Linha icone={Globe} rotulo="Site">
                  <TextoDoSite url={lead.site} />
                  {lead.site && <span className="mt-0.5 block truncate text-legenda text-ink-3">{lead.site}</span>}
                </Linha>
                {d?.instagram && (
                  <Linha icone={AtSign} rotulo="Instagram">
                    {d.instagram}
                  </Linha>
                )}
                {d?.endereco && (
                  <Linha icone={MapPin} rotulo="Endereço">
                    {d.endereco}
                  </Linha>
                )}
                <Linha icone={d?.reivindicado === false ? ShieldAlert : ShieldCheck} rotulo="Perfil no Google">
                  {d?.reivindicado === false ? "Não reivindicado pelo dono" : d?.reivindicado ? "Reivindicado pelo dono" : <span className="text-ink-3">Sem informação</span>}
                </Linha>
                {d && d.categorias.length > 0 && (
                  <Linha icone={Tag} rotulo="Categorias no Google">
                    <span className="flex flex-wrap gap-1.5">
                      {d.categorias.map((c) => (
                        <Badge key={c} variant="contorno">
                          {c}
                        </Badge>
                      ))}
                    </span>
                  </Linha>
                )}
                {d?.fotos != null && (
                  <Linha icone={Foto} rotulo="Fotos no Google">
                    {numeroBR(d.fotos)}
                  </Linha>
                )}
              </dl>

              <section className="border-t border-line pt-5" data-slot="ficha-horario">
                <h3 className="flex items-center gap-2 text-rotulo uppercase text-ink-3">
                  <Clock size={13} aria-hidden />
                  Horário
                </h3>
                {d?.horarios ? (
                  <table className="mt-3 w-full text-apoio">
                    <tbody>
                      {DIAS_DA_SEMANA.map(({ dow, longo }) => {
                        const dia = d.horarios?.find((h) => h.dow === dow);
                        return (
                          <tr key={dow} className="border-b border-line-soft last:border-0">
                            <th scope="row" className="py-1.5 text-left font-normal text-ink-2 first-letter:uppercase">
                              {longo}
                            </th>
                            <td className="py-1.5 text-right tabular-nums text-ink">{dia ? textoDoDia(dia) : <span className="text-ink-3">Sem informação</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-apoio text-ink-3">A busca não trouxe o horário.</p>
                )}
              </section>

              <section className="border-t border-line pt-5" data-slot="ficha-avaliacoes">
                <h3 className="flex items-center gap-2 text-rotulo uppercase text-ink-3">
                  <Star size={13} aria-hidden />
                  Avaliações
                </h3>
                <p className="mt-2 text-apoio text-ink">
                  {lead.nota === null ? "Sem nota" : `Nota ${lead.nota.toFixed(1).replace(".", ",")}`}
                  <span className="text-ink-3"> · {numeroBR(lead.avaliacoes ?? 0)} avaliações</span>
                </p>
                {d?.distribuicao && totalDasNotas > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {([5, 4, 3, 2, 1] as const).map((e) => (
                      <li key={e} className="flex items-center gap-3 text-legenda text-ink-2">
                        <span className="w-14 shrink-0 tabular-nums">{e} {e === 1 ? "estrela" : "estrelas"}</span>
                        <Medidor valor={pct(d.distribuicao?.[e] ?? 0, totalDasNotas)} tom={e >= 4 ? "marca" : "neutro"} rotulo={`${e} estrelas: ${d.distribuicao?.[e] ?? 0}`} className="flex-1" />
                        <span className="w-10 shrink-0 text-right tabular-nums">{numeroBR(d.distribuicao?.[e] ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </AreaRolavel>
        )}
      </SheetContent>
    </Sheet>
  );
}
