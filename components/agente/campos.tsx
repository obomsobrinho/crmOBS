"use client";

import { AlertTriangle, Bell, LayoutTemplate } from "lucide-react";
import AgentHoursEditor from "@/components/AgentHoursEditor";
import AgentBulletList from "@/components/AgentBulletList";
import KnowledgeManager from "@/components/KnowledgeManager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  estimarTokens,
  foraDoCache,
  DEFAULT_HANDOFF_NOTICE,
  GOALS,
  LIMITS,
  TONES,
  type AgentConfig,
  type Goal,
  type Tone,
} from "@/lib/agent-prompt";
import { AGENT_PRESETS, type AgentPreset } from "@/lib/agent-presets";
import type { KnowledgeDoc } from "@/lib/crm";
import { AvisoCache, Field, Hint, Par, SubBloco, Trio } from "./ui";

// Os campos do agente, em três grupos, na ordem em que se pensa sobre um
// funcionário novo: quem é você, o que você sabe, o que você pode fazer.
//
// ⚠️ ESTE ARQUIVO EXISTE PARA QUE O CAMPO NÃO EXISTA DUAS VEZES. São duas
// superfícies (o assistente de `/montagem` e as abas de `/agente`) sobre UM
// formulário: mesmos componentes, mesma validação (`validateConfig`, no
// servidor) e mesmo `PUT`. Se o assistente ganhar inputs próprios, os dois
// divergem na primeira mudança.
//
// A ÚNICA bifurcação entre as duas superfícies é `mostrarOpcionais`. O
// assistente passa `false` e some com o que não é obrigatório e não muda a
// primeira resposta do agente; as abas passam `true` e mostram tudo. Qualquer
// outra diferença entre as superfícies é bug, não decisão.

export interface CamposComuns {
  cfg: AgentConfig;
  patch: (p: Partial<AgentConfig>) => void;
  /** Erros por campo, como o `PUT /agent-config` devolve em `fields`. */
  fields: Record<string, string>;
  /**
   * Mostra os campos que não são obrigatórios nem mudam a primeira resposta.
   * `false` no assistente de montagem.
   */
  mostrarOpcionais?: boolean;
}

// ————————————————————————— 1. Quem atende —————————————————————————

export function CamposQuemAtende({
  cfg,
  patch,
  fields,
  mostrarOpcionais = true,
}: CamposComuns) {
  return (
    <>
      {mostrarOpcionais ? (
        <Trio>
          <CampoNomeEmpresa cfg={cfg} patch={patch} fields={fields} />
          <Field label="Site">
            <Input
              value={cfg.companySite}
              onChange={(e) => patch({ companySite: e.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field label="Endereço">
            <Input
              value={cfg.companyAddress}
              onChange={(e) => patch({ companyAddress: e.target.value })}
            />
          </Field>
        </Trio>
      ) : (
        <CampoNomeEmpresa cfg={cfg} patch={patch} fields={fields} />
      )}

      <Field label="O que a empresa faz" error={fields.companyWhat} required>
        <Textarea
          value={cfg.companyWhat}
          onChange={(e) => patch({ companyWhat: e.target.value })}
          rows={2}
          // ⚠️ O placeholder NÃO nomeia um segmento. A versão anterior dizia
          // "Ex.: é uma clínica odontológica no centro de...", e o beta é misto
          // (advogado, pediatra, barbeiro, engenheiro, clínica, loja): texto
          // fixo de tela que assume uma vertical faz o resto parecer não ser
          // para você. Quem dá exemplo de segmento é o modelo escolhido, que
          // preenche o campo de verdade.
          placeholder="Uma ou duas frases, do jeito que você explicaria para alguém que nunca ouviu falar."
          className="resize-none"
        />
      </Field>

      {mostrarOpcionais ? (
        <Par>
          <CampoNomeAgente cfg={cfg} patch={patch} fields={fields} />
          <Field label="Função (opcional)">
            <Input
              value={cfg.agentRole}
              onChange={(e) => patch({ agentRole: e.target.value })}
              placeholder="Ex.: atendente, consultora"
            />
          </Field>
        </Par>
      ) : (
        <CampoNomeAgente cfg={cfg} patch={patch} fields={fields} />
      )}

      <Field label="Tom de voz">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <Button
              key={t.value}
              variant="outline"
              onClick={() => patch({ tone: t.value as Tone })}
              aria-pressed={cfg.tone === t.value}
              className={`rounded-full ${
                cfg.tone === t.value
                  ? "border-brand-line bg-brand-surface text-brand-ink"
                  : ""
              }`}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </Field>
    </>
  );
}

function CampoNomeEmpresa({
  cfg,
  patch,
  fields,
}: Omit<CamposComuns, "mostrarOpcionais">) {
  return (
    <Field label="Nome da empresa" error={fields.companyName} required>
      <Input
        value={cfg.companyName}
        onChange={(e) => patch({ companyName: e.target.value })}
      />
      <Hint>
        Esse é o nome que o agente usa nas conversas; não muda o nome da sua
        conta.
      </Hint>
    </Field>
  );
}

function CampoNomeAgente({
  cfg,
  patch,
  fields,
}: Omit<CamposComuns, "mostrarOpcionais">) {
  return (
    <Field label="Nome do agente" error={fields.agentName} required>
      <Input
        value={cfg.agentName}
        onChange={(e) => patch({ agentName: e.target.value })}
        placeholder="Ex.: Alê"
      />
    </Field>
  );
}

/**
 * Seletor de modelo por segmento.
 *
 * As duas apresentações existem porque o mesmo controle muda de natureza com o
 * contexto: na montagem ele é CONVITE (a pessoa não tem nada a perder e o modelo
 * é a forma mais rápida de sair do zero), na edição ele é AÇÃO DESTRUTIVA
 * (substitui tom, objetivos, regras e detalhes de quem já configurou). Por isso
 * na edição ele fica no pé do grupo, depois de uma linha, e não no lugar mais
 * clicável da tela.
 */
export function SeletorDePreset({
  onEscolher,
  escolhido,
  apresentacao,
}: {
  onEscolher: (p: AgentPreset) => void;
  /** id do modelo aplicado agora, para marcar a pílula. Só no convite. */
  escolhido?: string | null;
  apresentacao: "convite" | "rodape";
}) {
  const pilulas = (
    <div className="flex flex-wrap gap-2">
      {AGENT_PRESETS.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          title={p.description}
          aria-pressed={apresentacao === "convite" ? escolhido === p.id : undefined}
          onClick={() => onEscolher(p)}
          className={`rounded-full ${
            apresentacao === "convite" && escolhido === p.id
              ? "border-brand-line bg-brand-surface text-brand-ink"
              : ""
          }`}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );

  if (apresentacao === "convite") {
    return (
      <div data-slot="preset-convite" className="space-y-2">
        <p className="flex items-center gap-2 text-apoio font-medium">
          <LayoutTemplate size={15} className="shrink-0 text-brand-ink" />
          Comece de um modelo do seu segmento
        </p>
        <Hint>
          Ele preenche tom, objetivos e limites. Você ajusta tudo depois.
        </Hint>
        {pilulas}
      </div>
    );
  }

  return (
    <div
      data-slot="preset-rodape"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3"
    >
      <div className="flex items-center gap-2 text-legenda text-ink-3">
        <LayoutTemplate size={15} className="shrink-0 text-brand-ink" />
        <span>
          Não sabe o que escrever? Comece de um modelo do seu segmento e ajuste
          depois.
        </span>
      </div>
      {pilulas}
    </div>
  );
}

// ————————————————————————— 2. O que ele sabe —————————————————————————

export function CamposOQueSabe({
  cfg,
  patch,
  mostrarOpcionais = true,
  personaPreview,
  clientId,
  knowledgeDocs,
  knowledgeKeyConfigured,
  preview = false,
}: Omit<CamposComuns, "fields"> & {
  /** Persona compilada, só para medir o risco de ficar fora do cache. */
  personaPreview: string;
  clientId: string;
  knowledgeDocs: KnowledgeDoc[];
  knowledgeKeyConfigured: boolean;
  preview?: boolean;
}) {
  // Persona curta demais para o cache de prompt da OpenAI pegar. Interessa ao
  // dono porque é custo: a persona vai inteira em TODA mensagem, e sem cache
  // cada turno paga o preço cheio de entrada. Só aparece quando o risco existe.
  const semCache = foraDoCache(personaPreview);

  return (
    <>
      {/* ⚠️ O HORÁRIO É O PRIMEIRO BLOCO DA ABA desde 22/09/2026 (pedido do
          dono: "deveria ser o primeiro dessa sessão"), e não o último atrás de
          um recolher. Ele é o único dado desta aba que o agente repete para o
          cliente palavra por palavra, e é o que alimenta a frase mais forte do
          painel; estava no fim porque um dia esta aba foi uma página de
          rolagem única, e ninguém mexeu na ordem quando ela virou aba.
          ⚠️ Segue FORA do assistente (`mostrarOpcionais`): ele não muda a
          primeira resposta do agente, e `mostrarOpcionais` é a única
          bifurcação permitida entre as duas superfícies. */}
      {mostrarOpcionais && (
        <SubBloco titulo="Horário de atendimento" primeiro>
          <div className="space-y-3">
            <Hint>
              O agente informa esse horário, mas não sabe a data e a hora atual,
              então ele nunca diz se está aberto ou fechado agora.
            </Hint>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
              <AgentHoursEditor
                value={cfg.hours}
                onChange={(v) => patch({ hours: v })}
              />
              <Field label="Observação de horário">
                <Input
                  value={cfg.hoursNote}
                  onChange={(e) => patch({ hoursNote: e.target.value })}
                  placeholder="Ex.: fechado em feriados"
                />
              </Field>
            </div>
          </div>
        </SubBloco>
      )}

      {/* É o campo que mais muda a qualidade da resposta e o único que resolve o
          aviso de cache de prompt.
          ⚠️ BLOCO, e não `Field`: os três desta aba (horário, detalhes,
          documentos) são assuntos diferentes, e o dono leu a mistura de níveis
          como falta de padrão. O rótulo de campo fica para campo que mora
          DENTRO de um bloco, como a observação de horário ali em cima. */}
      <SubBloco titulo="Detalhes do negócio">
        <div className="space-y-1.5">
          <Hint>
            O agente sabe isto de cor, e vale em toda conversa. Produtos,
            serviços, perguntas frequentes, promoções: escreva livremente.
          </Hint>
          <Textarea
            value={cfg.details}
            onChange={(e) =>
              patch({ details: e.target.value.slice(0, LIMITS.details) })
            }
            rows={4}
            className="max-h-[320px] resize-none [field-sizing:content]"
          />
          <div className="text-right text-legenda tabular-nums text-ink-3">
            {cfg.details.length}/{LIMITS.details}
          </div>
          {semCache && (
            <AvisoCache tokens={estimarTokens(personaPreview)}>
              Detalhar mais aqui deixa o agente melhor e mais barato ao mesmo
              tempo. Documento enviado abaixo não resolve isto: ele entra por
              consulta, depois do prompt.
            </AvisoCache>
          )}
        </div>
      </SubBloco>

      {/* A base de conhecimento mora AQUI desde 26/08/2026, e o argumento é o
          código, não navegação: a seção FONTES E HONESTIDADE do prompt lista
          "detalhes do negócio" e os trechos da base na MESMA frase, como o que o
          agente pode afirmar.
          ⚠️ UMA instância só. Duas divergiriam no primeiro upload. */}
      <SubBloco>
        <KnowledgeManager
          clientId={clientId}
          initialDocs={knowledgeDocs}
          keyConfigured={knowledgeKeyConfigured}
          apresentacao="bloco"
          preview={preview}
        />
      </SubBloco>
    </>
  );
}

// ———————————————————— 3. O que ele pode fazer ————————————————————

export function CamposOQuePodeFazer({
  cfg,
  patch,
  fields,
  notifyJid,
  setNotifyJid,
  onDraft,
}: Omit<CamposComuns, "mostrarOpcionais"> & {
  notifyJid: string;
  setNotifyJid: (v: string) => void;
  /** Rascunho ainda não adicionado numa lista, guardado pelo pai. */
  onDraft: (campo: "dontDo" | "escalateWhen", v: string) => void;
}) {
  const agendarSemGrupo =
    cfg.goals.includes("agendar") && notifyJid.trim() === "";

  return (
    <>
      {/* Objetivos SEM pintura. Eram três cartões em `bg-brand-surface`, o
          elemento de maior contraste do corpo da tela, para a escolha menos
          disputada do formulário: ela já vem com default e quase ninguém mexe. */}
      <SubBloco titulo="Objetivos" error={fields.goals} required primeiro>
        <div className="grid gap-1 sm:grid-cols-3">
          {GOALS.map((g) => {
            const active = cfg.goals.includes(g.value as Goal);
            return (
              // <label> com Checkbox de verdade, e não um <button> com um
              // quadrado desenhado dentro: a caixa aqui é caixa de marcar, e o
              // leitor de tela precisa saber disso.
              <label
                key={g.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--active-bg)]"
              >
                <Checkbox
                  checked={active}
                  onCheckedChange={(v) =>
                    patch({
                      goals:
                        v === true
                          ? [...cfg.goals, g.value as Goal]
                          : cfg.goals.filter((x) => x !== g.value),
                    })
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-apoio font-medium">{g.label}</span>
                  <span className="block text-legenda text-ink-3">{g.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </SubBloco>

      {/* O grupo de avisos aparece só com "Agendar" marcado: é o único objetivo
          que depende dele. Fora daí seria um campo técnico (um JID) pedido sem
          motivo. E o aviso de que ele está vazio mora AQUI, embaixo do campo que
          resolve, em vez de no topo da tela. */}
      {cfg.goals.includes("agendar") && (
        <SubBloco titulo="Grupo de WhatsApp para avisar">
          <div className="flex items-center gap-2">
            <Bell size={15} className="shrink-0 text-brand-ink" />
            <Input
              value={notifyJid}
              onChange={(e) => setNotifyJid(e.target.value)}
              placeholder="120363000000000000@g.us"
              className="flex-1 font-mono"
            />
          </div>
          {agendarSemGrupo ? (
            <p className="flex items-start gap-1.5 text-legenda text-warn-ink">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>
                Sem este grupo o agente não consegue avisar o time, e marcar uma
                conversa não vai funcionar. Peça o JID do grupo a quem cuida da
                automação.
              </span>
            </p>
          ) : (
            <Hint>
              Quando o agente marca uma conversa com o time, ele avisa neste
              grupo.
            </Hint>
          )}
        </SubBloco>
      )}

      {/* ⚠️ DEIXOU DE RECOLHER em 22/09/2026 (pedido do dono: "não precisa ser
          colapsado também, tem espaço abaixo, não faz sentido deixar
          colapsado"). Junto foi embora o `manterMontado`, e vale registrar por
          que ele existia: `AgentBulletList` guarda o rascunho ainda não
          adicionado num estado do pai, e o save o incorpora, então desmontar o
          bloco ao recolher faria o texto sumir da tela CONTINUANDO a ser
          salvo. Sem recolher, não há o que desmontar, e a armadilha deixa de
          existir para este bloco. Ela volta no minuto em que alguém puser
          `AgentBulletList` dentro de algo que desmonte. */}
      <SubBloco titulo="Limites e quando chamar o time">
        <div className="space-y-4">
          <Field label="O que o agente NÃO deve fazer">
            <AgentBulletList
              value={cfg.dontDo}
              onChange={(v) => patch({ dontDo: v })}
              onDraftChange={(v) => onDraft("dontDo", v)}
              placeholder="Ex.: nunca dar desconto por conta própria"
              maxLen={LIMITS.bullet}
            />
          </Field>
          <Field label="Quando chamar um humano">
            <AgentBulletList
              value={cfg.escalateWhen}
              onChange={(v) => patch({ escalateWhen: v })}
              onDraftChange={(v) => onDraft("escalateWhen", v)}
              placeholder="Ex.: quando pedirem orçamento fechado"
              maxLen={LIMITS.bullet}
            />
          </Field>
          <Field label="O que avisar ao passar para o time">
            <Input
              value={cfg.handoffNotice}
              onChange={(e) =>
                patch({
                  handoffNotice: e.target.value.slice(0, LIMITS.handoffNotice),
                })
              }
              placeholder={DEFAULT_HANDOFF_NOTICE}
            />
            <Hint>
              É a base da frase, não a frase pronta: o agente adapta ao que a
              pessoa acabou de pedir (por exemplo &quot;vou verificar se tem
              horário pra hoje&quot;). Em branco, ele usa a frase acima.
            </Hint>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-apoio">
            <Checkbox
              checked={cfg.neverAdmitAi}
              onCheckedChange={(v) => patch({ neverAdmitAi: v === true })}
            />
            Nunca admitir que é uma IA
          </label>
        </div>
      </SubBloco>
    </>
  );
}
