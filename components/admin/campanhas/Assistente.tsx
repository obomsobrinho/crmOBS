"use client";

import { memo, useMemo, useState } from "react";
import { Check, ChevronDown, CircleCheck, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { numeroBR, plural } from "@/lib/format";
import { diaIsoSP, diaMesHoraSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import {
  JANELA,
  MAXIMO_DE_VARIANTES,
  TETO_DIARIO,
  diasParaEnviar,
  problemasDaVariante,
  textoParaLead,
} from "@/lib/prospeccao";
import { haQuanto } from "./pecas";
import { leadsDoFiltro, type Busca, type Campanha, type ConexaoDisponivel, type Lead } from "./tipos";

// O ASSISTENTE de criação (referência: "Asset Group Setup", Dribbble 21751329):
// passos no topo; cada seção é uma linha com o check e, à direita, o resumo do
// que foi escolhido, e abre para editar; rodapé com "Salvo agora" e Cancelar /
// Continuar. Todo campo salva o rascunho na hora: dá para sair no meio.

const PASSOS = ["Campanha", "Contatos", "Mensagem", "Confirmar"] as const;
const HORA = 3_600_000;

// ── Peças do assistente ─────────────────────────────────────────────────

function Passos({ atual, completos, irPara }: { atual: number; completos: boolean[]; irPara: (p: number) => void }) {
  return (
    <nav aria-label="Passos da campanha" data-slot="assistente-passos">
      <p className="text-apoio text-ink-2 sm:hidden">
        Passo {atual} de {PASSOS.length}, <span className="font-semibold text-ink">{PASSOS[atual - 1]}</span>
      </p>
      <ol className="hidden items-center gap-3 sm:flex">
        {PASSOS.map((nome, i) => {
          const n = i + 1;
          const feito = n < atual && completos[i];
          const corrente = n === atual;
          // Só volta, ou avança até onde tudo antes já está completo.
          const alcancavel = n <= atual || completos.slice(0, i).every(Boolean);
          return (
            <li key={nome} className="flex min-w-0 flex-1 items-center gap-3 last:flex-none">
              <Button
                variant="nu"
                size="none"
                onClick={() => irPara(n)}
                disabled={!alcancavel}
                aria-current={corrente ? "step" : undefined}
                data-slot="assistente-passo"
                data-passo={n}
                className="flex shrink-0 items-center gap-2.5 rounded-lg text-left disabled:opacity-100"
              >
                <Marca feito={feito} corrente={corrente} numero={n} />
                <span className={corrente ? "text-apoio font-semibold text-ink" : "text-apoio text-ink-2"}>{nome}</span>
              </Button>
              {i < PASSOS.length - 1 && <span aria-hidden className="h-px min-w-6 flex-1 bg-line" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Marca({ feito, corrente, numero }: { feito: boolean; corrente?: boolean; numero?: number }) {
  if (feito)
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-[var(--brand-on)]">
        <Check size={14} strokeWidth={3} aria-hidden />
      </span>
    );
  return (
    <span
      className={
        corrente
          ? "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-brand text-legenda font-semibold text-brand-ink"
          : "flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-legenda text-ink-3"
      }
    >
      {numero}
    </span>
  );
}

/** Uma linha do passo: check, título, resumo à direita; abre para editar. */
function Secao({
  id,
  titulo,
  resumo,
  completa,
  aberta,
  alternar,
  children,
}: {
  id: string;
  titulo: string;
  resumo: React.ReactNode;
  completa: boolean;
  aberta: boolean;
  alternar?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li data-slot="assistente-secao" data-secao={id} data-completa={completa} data-aberta={aberta}>
      <Button
        variant="nu"
        size="none"
        onClick={alternar}
        aria-expanded={children ? aberta : undefined}
        aria-controls={children ? `secao-${id}` : undefined}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-[var(--active-bg)]"
      >
        <Marca feito={completa} />
        <span className="w-28 shrink-0 text-corpo font-semibold text-ink sm:w-40">{titulo}</span>
        <span className="min-w-0 flex-1 truncate text-right text-apoio text-ink-2">{resumo}</span>
        {children && (
          <ChevronDown size={16} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${aberta ? "rotate-180" : ""}`} />
        )}
      </Button>
      {children && aberta && (
        <div id={`secao-${id}`} className="px-5 pb-6 pt-3 sm:pl-[64px]">
          {children}
        </div>
      )}
    </li>
  );
}

function ListaDeSecoes({ children }: { children: React.ReactNode }) {
  return (
    <Card variant="conteudo" className="overflow-hidden">
      <ul className="divide-y divide-line-soft">{children}</ul>
    </Card>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-apoio font-semibold text-ink">{children}</span>;
}

// ── O assistente ────────────────────────────────────────────────────────

function Assistente({
  campanha,
  buscas,
  leads,
  campanhas,
  conexoes,
  agora,
  montadoEm,
  aoMudar,
  aoSair,
  aoIniciar,
  irParaLeads,
}: {
  campanha: Campanha;
  buscas: Busca[];
  leads: Lead[];
  campanhas: Campanha[];
  conexoes: ConexaoDisponivel[];
  agora: number;
  /** Quando a tela abriu: salvo depois disso = "Salvo agora". */
  montadoEm: number;
  aoMudar: (patch: Partial<Campanha>) => void;
  aoSair: () => void;
  aoIniciar: () => void;
  irParaLeads: () => void;
}) {
  const passo = campanha.passo;
  const [aberta, setAberta] = useState<string | null>(passo === 1 ? "nome" : passo === 2 ? "lista" : passo === 3 ? "v0" : null);
  const alternar = (id: string) => () => setAberta((a) => (a === id ? null : id));
  const irPara = (p: number) => {
    aoMudar({ passo: p });
    setAberta(p === 1 ? "nome" : p === 2 ? "lista" : p === 3 ? "v0" : null);
  };

  const entram = useMemo(() => leadsDoFiltro(leads, campanha.filtro, campanhas), [leads, campanha.filtro, campanhas]);
  const origem = campanha.filtro.quemNaoRespondeuDe ? campanhas.find((c) => c.id === campanha.filtro.quemNaoRespondeuDe) : null;
  const buscaEscolhida = buscas.find((b) => b.id === campanha.filtro.buscaId);
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const dias = diasParaEnviar(entram.length);
  const exemplo = entram[0]?.nome ?? "Clínica Exemplo";

  const inicio = campanha.agendadaPara ?? agora;
  const ultimoDia = dias > 0 ? somarDias(diaIsoSP(inicio), dias - 1) : null;
  const problemas = campanha.variantes.map(problemasDaVariante);

  const completos = [
    campanha.nome.trim() !== "" && numero !== undefined && (campanha.agendadaPara === null || campanha.agendadaPara > agora),
    entram.length > 0,
    campanha.variantes.length > 0 && problemas.every((p) => p.length === 0),
    true,
  ];
  const tudoPronto = completos.slice(0, 3).every(Boolean);

  const resumoDaLista = origem
    ? `Quem não respondeu: ${origem.nome}`
    : campanha.filtro.buscaId === "todas"
      ? "Todas as buscas"
      : buscaEscolhida
        ? `${buscaEscolhida.termo} · ${buscaEscolhida.cidade}`
        : "Escolha uma busca";
  const recortes = [
    campanha.filtro.soMarcadosComoBons ? "só os bons" : null,
    campanha.filtro.soSemSiteProprio ? "sem site próprio" : null,
    "não contatados",
  ].filter(Boolean);

  const dataAgendada = campanha.agendadaPara ? diaIsoSP(campanha.agendadaPara) : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="assistente">
      <div className="border-b border-line px-4 py-5 md:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <div>
            <p className="text-rotulo uppercase text-ink-3">Nova campanha</p>
            <h2 className="mt-1 truncate text-titulo text-ink">{campanha.nome.trim() || "Campanha sem nome"}</h2>
          </div>
          <Passos atual={passo} completos={completos} irPara={irPara} />
        </div>
      </div>

      <AreaRolavel tamanho={DISSOLVER_PADRAO} className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-8">
          {passo === 1 && (
            <>
              <Cabecalho titulo="Campanha" />
              <ListaDeSecoes>
                <Secao
                  id="nome"
                  titulo="Nome"
                  resumo={campanha.nome.trim() || "Falta o nome"}
                  completa={campanha.nome.trim() !== ""}
                  aberta={aberta === "nome"}
                  alternar={alternar("nome")}
                >
                  <Input
                    value={campanha.nome}
                    onChange={(e) => aoMudar({ nome: e.target.value })}
                    placeholder="Estética em Mutum"
                    aria-label="Nome da campanha"
                    autoFocus
                  />
                </Secao>
                <Secao
                  id="inicio"
                  titulo="Início"
                  resumo={campanha.agendadaPara ? `Agendada para ${diaMesHoraSP(campanha.agendadaPara)}` : "Assim que iniciar"}
                  completa={campanha.agendadaPara === null || campanha.agendadaPara > agora}
                  aberta={aberta === "inicio"}
                  alternar={alternar("inicio")}
                >
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Quando começa">
                    <Button variant="alternavel" size="field" aria-pressed={campanha.agendadaPara === null} onClick={() => aoMudar({ agendadaPara: null })}>
                      Hoje, assim que iniciar
                    </Button>
                    <Button
                      variant="alternavel"
                      size="field"
                      aria-pressed={campanha.agendadaPara !== null}
                      onClick={() =>
                        campanha.agendadaPara === null &&
                        aoMudar({ agendadaPara: inicioDoDiaSP(somarDias(diaIsoSP(agora), 1)) + JANELA.inicioHora * HORA })
                      }
                    >
                      Agendar
                    </Button>
                  </div>
                  {campanha.agendadaPara !== null && (
                    <label className="mt-4 flex max-w-xs flex-col gap-1.5">
                      <Rotulo>Dia</Rotulo>
                      <Input
                        type="date"
                        value={dataAgendada}
                        min={somarDias(diaIsoSP(agora), 1)}
                        onChange={(e) =>
                          e.target.value && aoMudar({ agendadaPara: inicioDoDiaSP(e.target.value) + JANELA.inicioHora * HORA })
                        }
                      />
                      <span className="text-legenda text-ink-3">Começa às {JANELA.inicioHora}h desse dia.</span>
                    </label>
                  )}
                </Secao>
                <Secao
                  id="numero"
                  titulo="Número que envia"
                  resumo={numero ? `${numero.nome} · ${numero.numero}` : "Escolha o número"}
                  completa={numero !== undefined}
                  aberta={aberta === "numero"}
                  alternar={alternar("numero")}
                >
                  <Select value={campanha.conexaoId ?? ""} onValueChange={(v) => aoMudar({ conexaoId: v })}>
                    <SelectTrigger className="w-full max-w-sm" aria-label="Número que envia" data-slot="assistente-numero">
                      <SelectValue placeholder="Escolha um WhatsApp conectado" />
                    </SelectTrigger>
                    <SelectContent>
                      {conexoes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} · {c.numero}
                          {c.conectado ? "" : " (desconectado)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Secao>
              </ListaDeSecoes>
            </>
          )}

          {passo === 2 && (
            <>
              <Cabecalho titulo="Contatos" />
              <ListaDeSecoes>
                <Secao
                  id="lista"
                  titulo="Lista"
                  resumo={`${resumoDaLista}${origem ? "" : `, ${recortes.join(", ")}`}`}
                  completa={entram.length > 0}
                  aberta={aberta === "lista"}
                  alternar={alternar("lista")}
                >
                  {origem ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-apoio text-ink-2">
                        Os leads de <span className="font-semibold text-ink">{origem.nome}</span> que receberam e não
                        responderam.
                      </p>
                      <Button
                        variant="link"
                        size="link"
                        className="self-start"
                        onClick={() => aoMudar({ filtro: { ...campanha.filtro, quemNaoRespondeuDe: null, buscaId: "todas" } })}
                      >
                        Escolher outra lista
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <label className="flex max-w-sm flex-col gap-1.5">
                        <Rotulo>Busca</Rotulo>
                        <Select
                          value={campanha.filtro.buscaId}
                          onValueChange={(v) => aoMudar({ filtro: { ...campanha.filtro, buscaId: v } })}
                        >
                          <SelectTrigger className="w-full" data-slot="assistente-busca">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todas as buscas</SelectItem>
                            {buscas.map((b) => (
                              <SelectItem key={b.id} value={b.id} disabled={b.situacao !== "pronta"}>
                                {b.termo} · {b.cidade}
                                {b.situacao === "buscando" ? " (buscando)" : b.situacao === "falhou" ? " (falhou)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <div className="flex flex-col gap-2.5">
                        <Rotulo>Recorte</Rotulo>
                        <label className="flex items-center gap-2.5 text-apoio text-ink">
                          <Checkbox
                            checked={campanha.filtro.soMarcadosComoBons}
                            onCheckedChange={(v) => aoMudar({ filtro: { ...campanha.filtro, soMarcadosComoBons: v === true } })}
                          />
                          Só os que marquei como bons
                        </label>
                        <label className="flex items-center gap-2.5 text-apoio text-ink">
                          <Checkbox
                            checked={campanha.filtro.soSemSiteProprio}
                            onCheckedChange={(v) => aoMudar({ filtro: { ...campanha.filtro, soSemSiteProprio: v === true } })}
                          />
                          Só quem não tem site próprio
                        </label>
                      </div>
                      <Button variant="link" size="link" className="self-start" onClick={irParaLeads} data-slot="assistente-nova-busca">
                        <Search aria-hidden />
                        Falta lead? Fazer uma nova busca
                      </Button>
                    </div>
                  )}
                </Secao>
                <Secao
                  id="quem"
                  titulo="Quem entra"
                  resumo={
                    entram.length === 0
                      ? "Ninguém ainda"
                      : `${numeroBR(entram.length)} ${plural(entram.length, "lead", "leads")}, ${dias} ${plural(dias, "dia", "dias")}`
                  }
                  completa={entram.length > 0}
                  aberta={aberta === "quem"}
                  alternar={alternar("quem")}
                >
                  {entram.length === 0 ? (
                    <EstadoVazio
                      tamanho="compacto"
                      className="items-start p-0 text-left"
                      texto={
                        buscaEscolhida?.situacao === "buscando"
                          ? "A busca ainda está rodando. Volte quando ela ficar pronta, o rascunho fica salvo."
                          : "Ninguém nesse recorte. Tire um recorte ou faça uma nova busca."
                      }
                    />
                  ) : (
                    <div className="flex flex-col gap-4" data-slot="assistente-quem">
                      <p className="text-apoio text-ink-2">
                        <span className="text-numero tabular-nums text-ink">{numeroBR(entram.length)}</span>{" "}
                        {plural(entram.length, "lead", "leads")}. A {TETO_DIARIO} por dia, leva{" "}
                        <span className="font-semibold text-ink">
                          {dias} {plural(dias, "dia", "dias")}
                        </span>
                        .
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {entram.slice(0, 8).map((l) => (
                          <li key={l.id} className="rounded-full bg-bloco px-2.5 py-1 text-legenda text-ink-2">
                            {l.nome}
                          </li>
                        ))}
                        {entram.length > 8 && (
                          <li className="px-1 py-1 text-legenda text-ink-3">e mais {numeroBR(entram.length - 8)}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </Secao>
              </ListaDeSecoes>
            </>
          )}

          {passo === 3 && (
            <>
              <Cabecalho titulo="Mensagem" />
              <ListaDeSecoes>
                {campanha.variantes.map((texto, i) => (
                  <Secao
                    key={i}
                    id={`v${i}`}
                    titulo={`Variante ${i + 1}`}
                    resumo={problemas[i].length > 0 ? problemas[i][0] : texto}
                    completa={problemas[i].length === 0}
                    aberta={aberta === `v${i}`}
                    alternar={alternar(`v${i}`)}
                  >
                    <div className="flex flex-col gap-3">
                      <Textarea
                        value={texto}
                        rows={5}
                        aria-label={`Texto da variante ${i + 1}`}
                        onChange={(e) =>
                          aoMudar({ variantes: campanha.variantes.map((t, j) => (j === i ? e.target.value : t)) })
                        }
                        data-slot="assistente-variante"
                      />
                      {problemas[i].length > 0 && <p className="text-legenda text-warn-ink">{problemas[i].join(". ")}.</p>}
                      <div>
                        <p className="text-rotulo uppercase text-ink-3">Como chega para {exemplo}</p>
                        <p className="mt-1.5 max-w-[520px] whitespace-pre-wrap rounded-xl rounded-tl-sm bg-bloco px-3.5 py-2.5 text-apoio text-ink">
                          {textoParaLead(texto, exemplo)}
                        </p>
                      </div>
                      {campanha.variantes.length > 1 && (
                        <Button
                          variant="danger-ghost"
                          size="chip"
                          className="self-start"
                          onClick={() => {
                            aoMudar({ variantes: campanha.variantes.filter((_, j) => j !== i) });
                            setAberta(null);
                          }}
                        >
                          <Trash2 aria-hidden />
                          Remover variante
                        </Button>
                      )}
                    </div>
                  </Secao>
                ))}
              </ListaDeSecoes>
              {campanha.variantes.length < MAXIMO_DE_VARIANTES && (
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    aoMudar({ variantes: [...campanha.variantes, ""] });
                    setAberta(`v${campanha.variantes.length}`);
                  }}
                >
                  <Plus aria-hidden />
                  Adicionar variante
                </Button>
              )}
            </>
          )}

          {passo === 4 && (
            <>
              <Cabecalho titulo="Confirmar" />
              <ListaDeSecoes>
                <Secao id="r-campanha" titulo="Campanha" resumo={`${campanha.nome} · ${numero?.nome ?? "sem número"}`} completa={completos[0]} aberta={false} alternar={() => irPara(1)} />
                <Secao
                  id="r-inicio"
                  titulo="Início"
                  resumo={campanha.agendadaPara ? diaMesHoraSP(campanha.agendadaPara) : "Hoje, assim que iniciar"}
                  completa={completos[0]}
                  aberta={false}
                  alternar={() => irPara(1)}
                />
                <Secao
                  id="r-contatos"
                  titulo="Contatos"
                  resumo={`${numeroBR(entram.length)} ${plural(entram.length, "lead", "leads")}`}
                  completa={completos[1]}
                  aberta={false}
                  alternar={() => irPara(2)}
                />
                <Secao
                  id="r-mensagem"
                  titulo="Mensagem"
                  resumo={`${campanha.variantes.length} ${plural(campanha.variantes.length, "variante", "variantes")}, revezando`}
                  completa={completos[2]}
                  aberta={false}
                  alternar={() => irPara(3)}
                />
                <Secao
                  id="r-envio"
                  titulo="Envio"
                  resumo={`${TETO_DIARIO} por dia, ${JANELA.inicioHora}h às ${JANELA.fimHora}h${ultimoDia ? `, termina por volta de ${ultimoDia.slice(8, 10)}/${ultimoDia.slice(5, 7)}` : ""}`}
                  completa
                  aberta={false}
                />
              </ListaDeSecoes>
            </>
          )}
        </div>
      </AreaRolavel>

      <footer className="border-t border-line bg-raised px-4 py-3 md:px-8" data-slot="assistente-rodape">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-legenda text-ink-3" aria-live="polite" data-slot="assistente-salvo">
            <CircleCheck size={15} aria-hidden />
            {campanha.salvaEm >= montadoEm ? "Salvo agora" : `Salvo ${haQuanto(campanha.salvaEm, agora)}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={aoSair} data-slot="assistente-cancelar">
              Cancelar
            </Button>
            {passo > 1 && (
              <Button variant="outline" onClick={() => irPara(passo - 1)}>
                Voltar
              </Button>
            )}
            {passo < 4 ? (
              <Button onClick={() => irPara(passo + 1)} disabled={!completos[passo - 1]} data-slot="assistente-continuar">
                Continuar
              </Button>
            ) : (
              <Button onClick={aoIniciar} disabled={!tudoPronto} data-slot="assistente-iniciar">
                {campanha.agendadaPara ? "Agendar" : "Iniciar"}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  return <h3 className="mb-1 text-cartao text-ink">{titulo}</h3>;
}

export default memo(Assistente);
