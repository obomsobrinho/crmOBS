"use client";

import {
  AlertTriangle,
  Bell,
  Bot,
  Building2,
  CalendarClock,
  LayoutTemplate,
  ShieldCheck,
  Store,
  Target,
} from "lucide-react";
import AgentHoursEditor from "@/components/AgentHoursEditor";
import AgentBulletList from "@/components/AgentBulletList";
import KnowledgeManager from "@/components/KnowledgeManager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  // Dois blocos com o cabeçalho do construtor (22/09/2026, pedido do dono:
  // "dentro de quem atende faltou os ícones"). Os campos são os mesmos e na
  // mesma ordem; o que entrou foi só a divisão entre empresa e agente, que é a
  // fronteira que o próprio prompt já faz (A EMPRESA e IDENTIDADE).
  return (
    <>
      <SubBloco
        titulo="A empresa"
        icone={Building2}
        descricao="Como o agente apresenta o seu negócio nas conversas."
        primeiro
      >
        <div className="space-y-4">
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

          <Field
            label="O que a empresa faz"
            error={fields.companyWhat}
            required
          >
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
        </div>
      </SubBloco>

      <SubBloco
        titulo="O agente"
        icone={Bot}
        descricao="Quem responde no WhatsApp e o jeito de falar."
      >
        <div className="space-y-4">
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
                  variant="alternavel"
                  onClick={() => patch({ tone: t.value as Tone })}
                  aria-pressed={cfg.tone === t.value}
                  className="rounded-full"
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </Field>
        </div>
      </SubBloco>
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
 * (substitui tom, objetivos, regras e detalhes de quem já configurou).
 *
 * ⚠️ NA EDIÇÃO ELE É UM MENU NA LINHA DAS ABAS desde 22/09/2026 (decisão do
 * dono). Morava no pé de "Quem atende", e ali parecia valer só para os campos
 * daquela aba, quando reescreve as três: só o tom mora em "Quem atende". A linha
 * das abas é o lugar das ações sobre o agente inteiro, ao lado de "Escrever o
 * prompt à mão". Continua passando pela confirmação de `choosePreset` quando o
 * formulário já tem conteúdo.
 */
export function SeletorDePreset({
  onEscolher,
  escolhido,
  apresentacao,
}: {
  onEscolher: (p: AgentPreset) => void;
  /** id do modelo aplicado agora, para marcar a pílula. Só no convite. */
  escolhido?: string | null;
  /**
   * `lista` é a do CELULAR (plano do mobile, fase 4): linhas de toque com a
   * descrição de cada modelo, dentro de uma folha de baixo. O menu suspenso
   * de 240px não serve para dedo, e o título do item (`title`) não aparece
   * sem ponteiro.
   */
  apresentacao: "convite" | "menu" | "lista";
}) {
  if (apresentacao === "lista") {
    return (
      <div data-slot="preset-lista" className="flex flex-col">
        <p className="px-3 pb-2 text-legenda text-ink-3">
          Substitui tom, objetivos, limites e detalhes
        </p>
        {AGENT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onEscolher(p)}
            className="flex min-h-12 flex-col justify-center rounded-lg px-3 py-2 text-left hover:bg-[var(--active-bg)]"
          >
            <span className="text-corpo text-ink">{p.label}</span>
            <span className="text-legenda text-ink-3">{p.description}</span>
          </button>
        ))}
      </div>
    );
  }

  if (apresentacao === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="chrome"
            data-preset-menu
          >
            <LayoutTemplate size={14} />
            Usar um modelo
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            Substitui tom, objetivos, limites e detalhes
          </DropdownMenuLabel>
          {AGENT_PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.id}
              title={p.description}
              onSelect={() => onEscolher(p)}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div data-slot="preset-convite" className="space-y-2">
      <p className="flex items-center gap-2 text-apoio font-medium">
        <LayoutTemplate size={15} className="shrink-0 text-brand-ink" />
        Comece de um modelo do seu segmento
      </p>
      <Hint>
        Ele preenche tom, objetivos e limites. Você ajusta tudo depois.
      </Hint>
      <div className="flex flex-wrap gap-2">
        {AGENT_PRESETS.map((p) => (
          <Button
            key={p.id}
            variant="alternavel"
            title={p.description}
            aria-pressed={escolhido === p.id}
            onClick={() => onEscolher(p)}
            className="rounded-full"
          >
            {p.label}
          </Button>
        ))}
      </div>
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

  // ⚠️ A OBSERVAÇÃO DE HORÁRIO SAIU DA TELA em 22/09/2026 (pedido do dono), mas
  // `hoursNote` segue no `agent_config` e no prompt: tirar o campo do tipo
  // mexeria na base do prompt. Conferido no banco no mesmo dia: nenhum tenant
  // tinha valor nela, então nada ficou invisível continuando a valer.
  const horario = (
    <SubBloco
      titulo="Horário de atendimento"
      icone={CalendarClock}
      descricao="Quando sua empresa atende. O agente informa esses horários aos clientes."
      primeiro
      className="flex h-full flex-col"
    >
      <AgentHoursEditor
        value={cfg.hours}
        onChange={(v) => patch({ hours: v })}
        className="flex-1"
      />
    </SubBloco>
  );

  // A base de conhecimento mora nesta aba desde 26/08/2026, e o argumento é o
  // código, não navegação: a seção FONTES E HONESTIDADE do prompt lista
  // "detalhes do negócio" e os trechos da base na MESMA frase, como o que o
  // agente pode afirmar.
  // ⚠️ UMA instância só. Duas divergiriam no primeiro upload.
  const documentos = (className?: string) => (
    <SubBloco className={className}>
      <KnowledgeManager
        clientId={clientId}
        initialDocs={knowledgeDocs}
        keyConfigured={knowledgeKeyConfigured}
        apresentacao="bloco"
        preview={preview}
      />
    </SubBloco>
  );

  // É o campo que mais muda a qualidade da resposta e o único que resolve o
  // aviso de cache de prompt.
  const detalhes = (primeiro: boolean) => (
    <SubBloco
      titulo="Detalhes do negócio"
      icone={Store}
      descricao="O que o agente sabe de cor em toda conversa: produtos, serviços, perguntas frequentes, promoções."
      primeiro={primeiro}
    >
      <div className="space-y-1.5">
        <Textarea
          value={cfg.details}
          onChange={(e) =>
            patch({ details: e.target.value.slice(0, LIMITS.details) })
          }
          rows={8}
          className="min-h-[200px] max-h-[420px] resize-none [field-sizing:content]"
        />
        <div className="text-right text-legenda tabular-nums text-ink-3">
          {cfg.details.length}/{LIMITS.details}
        </div>
        {semCache && (
          <AvisoCache tokens={estimarTokens(personaPreview)}>
            Detalhar mais aqui deixa o agente melhor e mais barato ao mesmo
            tempo. Documento enviado não resolve isto: ele entra por consulta,
            depois do prompt.
          </AvisoCache>
        )}
      </div>
    </SubBloco>
  );

  // No assistente o horário não aparece (`mostrarOpcionais`, a única bifurcação
  // permitida), e aí a ordem continua a de antes: detalhes, depois documentos.
  if (!mostrarOpcionais) {
    return (
      <>
        {detalhes(true)}
        {documentos()}
      </>
    );
  }

  // ⚠️ HORÁRIO E DOCUMENTOS LADO A LADO, DETALHES EMBAIXO NA LARGURA INTEIRA
  // (22/09/2026, pedido do dono). Os dois de cima são blocos curtos, e o de
  // baixo é o texto longo: na largura inteira ele ganha linha para escrever. O
  // horário continua o primeiro da aba (à esquerda), que foi o pedido anterior.
  // ⚠️ Os dois CARTÕES têm a mesma altura (a grade estica, e cada bloco passa a
  // altura adiante até a moldura), e os dois cabeçalhos têm o mesmo respiro até
  // ela, pedido do dono: "está tudo torto". Por isso a frase "Entra no ar..." dos
  // documentos mora DENTRO do cartão: embaixo dele, os fundos nunca alinhariam.
  return (
    <>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {horario}
        {/* Em tela estreita os dois empilham e o filete do `SubBloco` separa;
            lado a lado, o filete sai e o bloco estica até a altura do vizinho. */}
        {documentos("lg:h-full lg:border-t-0 lg:pt-0")}
      </div>
      {detalhes(false)}
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
      <SubBloco
        titulo="Objetivos"
        icone={Target}
        descricao="O que o agente busca em cada conversa."
        error={fields.goals}
        required
        primeiro
      >
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
                  <span className="block text-apoio font-medium">
                    {g.label}
                  </span>
                  <span className="block text-legenda text-ink-3">
                    {g.hint}
                  </span>
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
        <SubBloco
          titulo="Grupo de WhatsApp para avisar"
          icone={Bell}
          descricao="Onde o agente avisa o time quando marca uma conversa."
        >
          {/* A dica de antes ("quando o agente marca uma conversa, ele avisa
              neste grupo") virou o subtítulo; repetir embaixo seria ruído. */}
          <div className="space-y-1.5">
            <Input
              value={notifyJid}
              onChange={(e) => setNotifyJid(e.target.value)}
              placeholder="120363000000000000@g.us"
              className="font-mono"
            />
            {agendarSemGrupo && (
              <p className="flex items-start gap-1.5 text-legenda text-warn-ink">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                <span>
                  Sem este grupo o agente não consegue avisar o time, e marcar
                  uma conversa não vai funcionar. Peça o JID do grupo a quem
                  cuida da automação.
                </span>
              </p>
            )}
          </div>
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
      <SubBloco
        titulo="Limites e quando chamar o time"
        icone={ShieldCheck}
        descricao="O que o agente nunca faz e quando ele passa a conversa para você."
      >
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
