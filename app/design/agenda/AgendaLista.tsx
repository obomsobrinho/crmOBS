"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  CalendarX2,
  Check,
  Ellipsis,
  ExternalLink,
  MessagesSquare,
  RefreshCw,
  Sparkles,
  Unplug,
  UserRound,
} from "lucide-react";
import AvatarContato from "@/components/AvatarContato";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { diaIsoSP } from "@/lib/fuso";
import {
  CONTA_GOOGLE,
  faixa,
  marcados,
  rotuloDoDia,
  textoDoLembrete,
  type Marcado,
} from "./dados";

// Protótipo da lista da Agenda (docs/plano-agenda.md, seção 4). Dados falsos,
// nenhum botão fala com o Google. Na versão de verdade a lista pagina de 10 em
// 10 (rolagem infinita, `usePaginada`), ordena por início e o realtime de
// `appointments` atualiza UMA linha.

type Aba = "proximos" | "cancelados";

export default function AgendaLista({
  agora,
  vazio,
  desconectada,
}: {
  agora: number;
  vazio: boolean;
  desconectada: boolean;
}) {
  const hoje = diaIsoSP(agora);
  const [linhas, setLinhas] = useState<Marcado[]>(() => (vazio ? [] : marcados(agora)));
  const [aba, setAba] = useState<Aba>("proximos");
  const [lembrar, setLembrar] = useState<Marcado | null>(null);
  const [cancelar, setCancelar] = useState<Marcado | null>(null);

  const ativos = linhas.filter((l) => l.situacao !== "cancelado");
  const visiveis = aba === "proximos" ? ativos : linhas.filter((l) => l.situacao === "cancelado");

  // Agrupado por dia civil de São Paulo, na ordem de início.
  const grupos = useMemo(() => {
    const m = new Map<string, Marcado[]>();
    for (const l of [...visiveis].sort((a, b) => a.inicio - b.inicio)) {
      const d = diaIsoSP(l.inicio);
      m.set(d, [...(m.get(d) ?? []), l]);
    }
    return [...m.entries()];
  }, [visiveis]);

  const deHoje = ativos.filter((l) => diaIsoSP(l.inicio) === hoje);
  const proximo = deHoje.find((l) => l.inicio > agora);

  return (
    <Card
      variant="pagina"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-agenda="prototipo"
    >
      <header className="border-b border-line px-6 pb-3 pt-5 max-md:px-4 max-md:pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Agenda</h1>
          </div>
          <div className="flex items-center gap-2">
            {!desconectada && (
              <Badge variant="contorno" className="max-sm:hidden" data-agenda="conta">
                <span className="size-2 rounded-full bg-[var(--human-fill)]" aria-hidden />
                {CONTA_GOOGLE}
              </Badge>
            )}
            <Button variant="outline" size="control" asChild>
              <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                Abrir Google Agenda
              </a>
            </Button>
          </div>
        </div>
        <p className="mt-1 text-legenda text-ink-3">
          Os horários que a IA e o time marcaram. Quem manda é a sua Google Agenda: o que você muda
          lá vale aqui.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
            <TabsList variant="painel" className="bg-canvas" aria-label="Horários">
              <TabsTrigger value="proximos" variant="painel" data-agenda="aba">
                Próximos
                <span className="ml-1.5 tabular-nums opacity-75">{ativos.length}</span>
              </TabsTrigger>
              <TabsTrigger value="cancelados" variant="painel" data-agenda="aba">
                Cancelados
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {aba === "proximos" && ativos.length > 0 && (
            <p className="text-legenda text-ink-2" data-agenda="resumo">
              Hoje: {deHoje.length} {deHoje.length === 1 ? "horário" : "horários"}
              {proximo && <>, o próximo às {faixa(proximo).split(" ")[0]}</>}
            </p>
          )}
        </div>
      </header>

      {desconectada && (
        <Aviso
          tom="danger"
          forma="faixa"
          icone={Unplug}
          className="mx-6 mt-3 max-md:mx-0 max-md:mt-0"
          data-agenda="desconectada"
        >
          <span className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>
              A Google Agenda desconectou. Até reconectar, a IA volta a combinar dia e horário e o
              time confirma.
            </span>
            <Button size="control" variant="outline">
              <RefreshCw size={14} />
              Reconectar
            </Button>
          </span>
        </Aviso>
      )}

      {grupos.length === 0 ? (
        <EstadoVazio
          icone={CalendarDays}
          titulo={aba === "proximos" ? "Nenhum horário marcado" : "Nenhum cancelamento"}
          texto={
            aba === "proximos"
              ? "Quando a IA marcar um horário na conversa, ele aparece aqui e na sua Google Agenda."
              : "Horários cancelados pelo contato ou pelo time aparecem aqui."
          }
          tamanho="detalhe"
        />
      ) : (
        <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pb-6 max-md:px-4">
            {grupos.map(([dia, itens]) => (
              <section key={dia} data-agenda="dia" className="pt-4">
                <h2 className="mb-2 text-rotulo uppercase text-ink-3">{rotuloDoDia(dia, hoje)}</h2>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {itens.map((l) => (
                    <Linha
                      key={l.id}
                      l={l}
                      passou={l.fim <= agora}
                      onLembrar={() => setLembrar(l)}
                      onCancelar={() => setCancelar(l)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            <p className="pt-4 text-center text-legenda text-ink-3">
              Mostrando os próximos {visiveis.length}. Na versão real, a lista carrega de 10 em 10.
            </p>
          </div>
        </AreaRolavel>
      )}

      <Dialog open={!!lembrar} onOpenChange={(v) => !v && setLembrar(null)}>
        <DialogContent tamanho="confirmacao" className="max-w-md" data-agenda="lembrete">
          {lembrar && (
            <>
              <DialogTitle>Enviar lembrete</DialogTitle>
              <DialogDescription className="mt-2 mb-3">
                Vai pelo WhatsApp, na conversa com {lembrar.nome}. Dá para ajustar antes de enviar.
              </DialogDescription>
              <Textarea
                defaultValue={textoDoLembrete(lembrar, hoje)}
                rows={4}
                aria-label="Texto do lembrete"
                className="mb-4 resize-y"
              />
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" size="field" className="px-4">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  variant="send"
                  size="field"
                  className="px-4"
                  onClick={() => {
                    setLinhas((ls) =>
                      ls.map((x) => (x.id === lembrar.id ? { ...x, lembreteEnviado: true } : x))
                    );
                    setLembrar(null);
                  }}
                >
                  Enviar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelar} onOpenChange={(v) => !v && setCancelar(null)}>
        <DialogContent tamanho="confirmacao" data-agenda="cancelar">
          {cancelar && (
            <>
              <DialogTitle>Cancelar este horário?</DialogTitle>
              <DialogDescription className="mt-2 mb-5">
                {cancelar.nome}, {rotuloDoDia(diaIsoSP(cancelar.inicio), hoje).toLowerCase()},{" "}
                {faixa(cancelar)}. Sai da sua Google Agenda e o horário fica livre para a IA
                oferecer. O contato não é avisado automaticamente.
              </DialogDescription>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" size="field" className="px-4">
                    Manter
                  </Button>
                </DialogClose>
                <Button
                  variant="danger"
                  size="field"
                  className="px-4"
                  onClick={() => {
                    setLinhas((ls) =>
                      ls.map((x) =>
                        x.id === cancelar.id ? { ...x, situacao: "cancelado", canceladoPor: "time" } : x
                      )
                    );
                    setCancelar(null);
                  }}
                >
                  Cancelar horário
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Linha({
  l,
  passou,
  onLembrar,
  onCancelar,
}: {
  l: Marcado;
  passou: boolean;
  onLembrar: () => void;
  onCancelar: () => void;
}) {
  const cancelado = l.situacao === "cancelado";
  const removido = l.situacao === "removido_google";
  return (
    <li
      data-agenda="linha"
      data-situacao={l.situacao}
      className="flex items-center gap-3 px-3 py-2.5 max-sm:flex-wrap"
    >
      <div className="w-[104px] shrink-0 max-sm:w-auto">
        <p className={passou || cancelado ? "text-apoio text-ink-3 tabular-nums" : "text-apoio font-semibold tabular-nums"}>
          {faixa(l)}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 max-sm:basis-full max-sm:order-last">
        <AvatarContato phone={l.telefone} name={l.nome.startsWith("+") ? null : l.nome} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-apoio font-medium">{l.nome}</p>
          <p className="flex items-center gap-1 truncate text-legenda text-ink-3">
            {l.marcadoPor === "ia" ? <Sparkles size={12} /> : <UserRound size={12} />}
            {l.servico}, {l.marcadoPor === "ia" ? "marcado pela IA" : "marcado pelo time"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 max-sm:ml-auto">
        {removido ? (
          <Badge variant="estado-aviso">Apagado no Google</Badge>
        ) : cancelado ? (
          <Badge variant="estado-neutro">
            {l.canceladoPor === "cliente" ? "Cancelado pelo contato" : "Cancelado pelo time"}
          </Badge>
        ) : passou ? (
          <Badge variant="estado-neutro">Já passou</Badge>
        ) : (
          <Badge variant="estado-bom">
            <Check size={12} />
            Confirmado
          </Badge>
        )}
        {l.lembreteEnviado && !cancelado && (
          <Badge variant="motivo" className="gap-1" data-agenda="lembrete-enviado">
            <Bell size={12} />
            Lembrado
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-control" aria-label={`Ações do horário de ${l.nome}`}>
              <Ellipsis size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem>
              <MessagesSquare size={14} />
              Abrir conversa
            </DropdownMenuItem>
            {!cancelado && !removido && (
              <DropdownMenuItem asChild>
                <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  Ver na Google Agenda
                </a>
              </DropdownMenuItem>
            )}
            {!cancelado && !removido && !passou && (
              <DropdownMenuItem onSelect={onLembrar}>
                <Bell size={14} />
                Enviar lembrete
              </DropdownMenuItem>
            )}
            {!cancelado && !passou && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="perigo" onSelect={onCancelar}>
                  <CalendarX2 size={14} />
                  {removido ? "Marcar como cancelado" : "Cancelar horário"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
