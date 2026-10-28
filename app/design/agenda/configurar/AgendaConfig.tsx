"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  Clock,
  Eye,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import { CabecalhoBloco, Field, Hint, MOLDURA_LISTA, SubBloco } from "@/components/agente/ui";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { diaIsoSP } from "@/lib/fuso";
import { horaTexto } from "@/lib/horarios";
import {
  CONTA_GOOGLE,
  EMPRESA,
  NOME_DA_AGENDA,
  OPCOES_ANTECEDENCIA,
  OPCOES_DIAS,
  OPCOES_DURACAO,
  OPCOES_INTERVALO,
  REGRAS_INICIAIS,
  fraseDaIA,
  horariosLivres,
  rotuloDoDia,
  rotuloDuracao,
  tresEspalhados,
  type Regras,
  type Servico,
} from "../dados";

// Protótipo do bloco de AGENDA dentro de "O que ele pode fazer" (/agente), só
// com "Agendar" marcado (docs/plano-agenda.md, seção 4). Nada aqui salva nem
// fala com o Google. A prévia à direita recalcula na hora os horários que a IA
// ofereceria com as regras da tela, sobre a agenda falsa de `dados.ts`.

export default function AgendaConfig({
  agora,
  conectadaInicial,
}: {
  agora: number;
  conectadaInicial: boolean;
}) {
  const hoje = diaIsoSP(agora);
  const [conectada, setConectada] = useState(conectadaInicial);
  const [regras, setRegras] = useState<Regras>(REGRAS_INICIAIS);
  const [servicoDaPrevia, setServicoDaPrevia] = useState(0);
  const mudar = (p: Partial<Regras>) => setRegras((r) => ({ ...r, ...p }));
  const mudarServico = (i: number, p: Partial<Servico>) =>
    mudar({ servicos: regras.servicos.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  const servico = regras.servicos[Math.min(servicoDaPrevia, regras.servicos.length - 1)];
  const duracao = servico?.minutos ?? 30;
  const dias = useMemo(
    () => horariosLivres(agora, regras, duracao, 3),
    [agora, regras, duracao]
  );

  return (
    <Card
      variant="pagina"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-agenda="configurar"
    >
      <AreaRolavel className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 py-5 max-md:px-4 max-md:py-3">
          <p className="text-legenda text-ink-3">Agente, O que ele pode fazer</p>
          <h1 className="mb-1 text-titulo">Agenda</h1>
          <p className="mb-5 text-apoio text-ink-2">
            Com &quot;Agendar&quot; marcado, a IA oferece horários livres da sua Google Agenda e
            marca sozinha. Sem conectar, ela segue como hoje: combina dia e horário e o time confirma.
          </p>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <SubBloco
                primeiro
                titulo="Google Agenda"
                icone={CalendarCheck}
                descricao="Onde a IA procura horário livre e marca."
              >
                {conectada ? (
                  <div className={MOLDURA_LISTA} data-agenda="conectada">
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <span className="size-2 shrink-0 rounded-full bg-[var(--human-fill)]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-apoio font-medium">{CONTA_GOOGLE}</p>
                        <p className="truncate text-legenda text-ink-3">
                          Marca em &quot;{NOME_DA_AGENDA}&quot;
                        </p>
                      </div>
                      <Button variant="danger-ghost" size="control" onClick={() => setConectada(false)}>
                        <Unplug size={14} />
                        Desconectar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3" data-agenda="desconectada">
                    <Button size="primary" onClick={() => setConectada(true)}>
                      <CalendarCheck size={16} />
                      Conectar Google Agenda
                    </Button>
                    <Hint>Você entra com a sua conta Google e autoriza. Leva menos de um minuto.</Hint>
                  </div>
                )}
                <ul className="mt-3 space-y-1.5 text-legenda text-ink-2">
                  <li className="flex gap-2">
                    <Lock size={14} className="mt-0.5 shrink-0 text-ink-3" />
                    A IA só vê se cada horário está livre ou ocupado, nunca o que está escrito nos
                    seus compromissos.
                  </li>
                  <li className="flex gap-2">
                    <CalendarClock size={14} className="mt-0.5 shrink-0 text-ink-3" />
                    Os horários marcados ficam numa agenda separada, &quot;{NOME_DA_AGENDA}&quot;, que
                    aparece junto das suas no celular.
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ink-3" />
                    Almoço, folga ou feriado: marque como ocupado na Google Agenda e a IA não oferece.
                  </li>
                </ul>
              </SubBloco>

              <SubBloco
                titulo="Serviços e duração"
                icone={Clock}
                descricao="Quanto tempo cada um ocupa. Com um só, a IA não pergunta qual."
              >
                <div className={MOLDURA_LISTA} data-agenda="servicos">
                  {regras.servicos.map((s, i) => (
                    <div key={s.chave} className="flex items-center gap-2 px-3 py-2">
                      <Input
                        variant="sutil"
                        value={s.nome}
                        onChange={(e) => mudarServico(i, { nome: e.target.value })}
                        aria-label={`Nome do serviço ${i + 1}`}
                        className="min-w-0 flex-1"
                      />
                      <Select
                        value={String(s.minutos)}
                        onValueChange={(v) => mudarServico(i, { minutos: Number(v) })}
                      >
                        <SelectTrigger aria-label={`Duração de ${s.nome}`} className="w-[104px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCOES_DURACAO.map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {rotuloDuracao(m)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="danger-ghost"
                        size="icon-control"
                        aria-label={`Remover ${s.nome}`}
                        disabled={regras.servicos.length === 1}
                        onClick={() => mudar({ servicos: regras.servicos.filter((_, j) => j !== i) })}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="link"
                  size="link"
                  className="mt-2"
                  onClick={() =>
                    mudar({
                      servicos: [
                        ...regras.servicos,
                        { chave: `novo-${regras.servicos.length + 1}`, nome: "Novo serviço", minutos: 30 },
                      ],
                    })
                  }
                >
                  <Plus size={14} />
                  Adicionar serviço
                </Button>
              </SubBloco>

              <SubBloco
                titulo="Regras dos horários"
                icone={CalendarClock}
                descricao="Sempre dentro do horário de atendimento da aba O que ele sabe."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Antecedência mínima">
                    <Select
                      value={String(regras.antecedencia)}
                      onValueChange={(v) => mudar({ antecedencia: Number(v) })}
                    >
                      <SelectTrigger aria-label="Antecedência mínima" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPCOES_ANTECEDENCIA.map((o) => (
                          <SelectItem key={o.valor} value={String(o.valor)}>
                            {o.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Até quantos dias à frente">
                    <Select
                      value={String(regras.diasAFrente)}
                      onValueChange={(v) => mudar({ diasAFrente: Number(v) })}
                    >
                      <SelectTrigger aria-label="Até quantos dias à frente" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPCOES_DIAS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} dias
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Intervalo entre um horário e outro">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Intervalo">
                      {OPCOES_INTERVALO.map((m) => (
                        <Button
                          key={m}
                          variant="alternavel"
                          size="control"
                          aria-pressed={regras.intervalo === m}
                          onClick={() => mudar({ intervalo: m })}
                        >
                          {m === 0 ? "Sem intervalo" : `${m} min`}
                        </Button>
                      ))}
                    </div>
                  </Field>
                </div>
              </SubBloco>

              <SubBloco
                titulo="Quem confirma"
                icone={ShieldCheck}
                descricao="O que acontece quando a pessoa escolhe um horário."
              >
                <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Quem confirma">
                  <Button
                    variant="alternavel"
                    size="linha-alta"
                    aria-pressed={regras.confirmacao === "ia"}
                    onClick={() => mudar({ confirmacao: "ia" })}
                  >
                    <span className="text-apoio font-semibold">A IA confirma na hora</span>
                    <span className="text-legenda text-ink-3">
                      O horário vai para a agenda e o time recebe o aviso.
                    </span>
                  </Button>
                  <Button
                    variant="alternavel"
                    size="linha-alta"
                    aria-pressed={regras.confirmacao === "time"}
                    onClick={() => mudar({ confirmacao: "time" })}
                  >
                    <span className="text-apoio font-semibold">O time aprova cada um</span>
                    <span className="text-legenda text-ink-3">
                      Entra como &quot;a confirmar&quot; e a pessoa espera o time.
                    </span>
                  </Button>
                </div>
                <Aviso tom="neutro" className="mt-3">
                  Protótipo: as opções desta tela são as decisões D3 a D7 do plano, ainda em aberto.
                </Aviso>
              </SubBloco>
            </div>

            <aside
              className="rounded-xl border border-line bg-bloco p-4"
              data-agenda="previa"
              aria-label="Prévia dos horários"
            >
              <CabecalhoBloco
                icone={Eye}
                titulo="O que a IA ofereceria agora"
                descricao="Com estas regras, sobre a sua agenda."
                className="mb-3"
              />
              {regras.servicos.length > 1 && (
                <Select
                  value={String(Math.min(servicoDaPrevia, regras.servicos.length - 1))}
                  onValueChange={(v) => setServicoDaPrevia(Number(v))}
                >
                  <SelectTrigger aria-label="Serviço da prévia" className="mb-3 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {regras.servicos.map((s, i) => (
                      <SelectItem key={s.chave} value={String(i)}>
                        {s.nome} ({rotuloDuracao(s.minutos)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!conectada ? (
                <p className="text-legenda text-ink-3">
                  Conecte a Google Agenda para ver os horários livres.
                </p>
              ) : (
                <>
                  <p
                    className="mb-3 rounded-lg border border-line bg-raised px-3 py-2 text-apoio"
                    data-agenda="frase"
                  >
                    {fraseDaIA(dias, hoje)}
                  </p>
                  <div className="space-y-3">
                    {dias.map((d) => {
                      const oferecidos = new Set(tresEspalhados(d.horarios));
                      return (
                        <div key={d.dia} data-agenda="previa-dia">
                          <p className="mb-1.5 text-rotulo uppercase text-ink-3">
                            {rotuloDoDia(d.dia, hoje)}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {d.horarios.map((m) => (
                              <span
                                key={m}
                                data-oferecido={oferecidos.has(m) ? "sim" : undefined}
                                className={
                                  oferecidos.has(m)
                                    ? "rounded-md border border-brand-line bg-brand-surface px-2 py-0.5 text-legenda font-semibold tabular-nums text-brand-ink"
                                    : "rounded-md border border-line-soft px-2 py-0.5 text-legenda tabular-nums text-ink-2"
                                }
                              >
                                {horaTexto(m)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-legenda text-ink-3">
                    Em destaque, os três que a IA diria primeiro. Ocupados na agenda de {EMPRESA} não
                    aparecem.
                  </p>
                </>
              )}
            </aside>
          </div>
        </div>
      </AreaRolavel>
    </Card>
  );
}
