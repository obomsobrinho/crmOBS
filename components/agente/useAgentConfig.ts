"use client";

import { useMemo, useState } from "react";
import {
  buildAdvancedPersona,
  buildBaseTail,
  buildPersona,
  stripBaseTail,
  EMPTY_CONFIG,
  LIMITS,
  type AgentConfig,
} from "@/lib/agent-prompt";
import type { AgentPreset } from "@/lib/agent-presets";
import type { ConfiguracaoEmEdicao } from "@/components/Playground";

export type Mode = "guiado" | "avancado";

// Estado e persistência da configuração do agente.
//
// ⚠️ EXISTE PARA HAVER UM `PUT` SÓ. As duas superfícies (o assistente de
// `/montagem` e as abas de `/agente`) chamam este mesmo `save`, então validação,
// guarda anti-destruição do prompt manual e compilação da persona no servidor
// não têm como divergir. Um `save` por superfície seria duas opiniões sobre o
// que é uma configuração válida, e a que estivesse errada só apareceria em
// produção.
//
// A persona NUNCA é compilada aqui para ser enviada: o corpo do `PUT` leva a
// configuração CRUA e quem compila é a rota, porque o rabo invariante da base
// (`buildBaseTail`) não pode depender do browser. O que se compila aqui é só
// PREVIEW (o drawer de prompt e o aviso de cache).

export interface UseAgentConfigArgs {
  clientId: string;
  initialMode: Mode;
  initialConfig: AgentConfig | null;
  initialPersona: string | null;
  /** Nome sugerido p/ o campo "empresa" na 1ª configuração (sem agent_config). */
  prefillCompanyName?: string | null;
  hasManualPersona: boolean;
  initialNotifyJid: string | null;
  /** /design e mocks: desativa o fetch de salvar. */
  preview?: boolean;
}

export function useAgentConfig({
  clientId,
  initialMode,
  initialConfig,
  initialPersona,
  prefillCompanyName,
  hasManualPersona,
  initialNotifyJid,
  preview = false,
}: UseAgentConfigArgs) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [cfg, setCfg] = useState<AgentConfig>(
    initialConfig ??
      (prefillCompanyName
        ? { ...EMPTY_CONFIG, companyName: prefillCompanyName }
        : EMPTY_CONFIG)
  );

  // No modo avançado a textarea guarda SÓ a parte editável. O rabo da base
  // (precedência, quando chamar humano, anti-manipulação, OUTPUT) é recolado
  // pelo servidor a cada save, então mostrar ele como texto editável faria a
  // pessoa achar que pode mudar o contrato de saída.
  const inicial = stripBaseTail(initialPersona ?? "");
  const [rawPersona, setRawPersona] = useState<string>(inicial.head);
  // Seções da base que estavam escritas à mão na persona guardada. Se existirem,
  // a pessoa precisa saber que elas passaram a ser fixas ANTES de salvar, senão
  // o texto dela sumiria em silêncio no primeiro save.
  const [tailRemovido] = useState<string[]>(inicial.removed);

  // Grupo de notificação. Mora aqui, e não em cartão próprio, para existir um
  // único Salvar na tela; o save dispara os dois PUT.
  const [notifyJid, setNotifyJid] = useState<string>(initialNotifyJid ?? "");
  const [savedJid, setSavedJid] = useState<string>(initialNotifyJid ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Deixa de ter persona manual assim que o guiado salva com sucesso.
  const [hadManual, setHadManual] = useState(hasManualPersona);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<AgentPreset | null>(null);
  const [presetAplicado, setPresetAplicado] = useState<string | null>(null);

  // Rascunhos ainda não adicionados nas listas de regras. São incorporados ao
  // salvar, mesmo que a pessoa esqueça de clicar em "Adicionar".
  //
  // ⚠️ ESTADO, e não `useRef`, apesar de o ref evitar um render por tecla. Este
  // hook é consumido por duas telas, e devolver qualquer coisa que aliase um ref
  // faz o `react-hooks/refs` marcar TODA leitura de propriedade do retorno como
  // leitura de ref durante o render: as duas telas juntas davam 58 erros. E o
  // ganho do ref era ilusório de qualquer forma, porque todo campo do formulário
  // já re-renderiza a tela inteira a cada tecla, via `patch`.
  const [drafts, setDrafts] = useState<{ dontDo: string; escalateWhen: string }>(
    { dontDo: "", escalateWhen: "" }
  );

  const guidedPersona = useMemo(() => buildPersona(cfg), [cfg]);
  // No avançado o preview mostra o resultado REAL (texto dele mais o rabo da
  // base), que é o que o n8n vai ler. Mostrar só o texto dele esconderia metade
  // do prompt.
  const advancedPersona = useMemo(
    () => buildAdvancedPersona(rawPersona, { handoffNotice: cfg.handoffNotice }),
    [rawPersona, cfg.handoffNotice]
  );
  const previewPersona = mode === "guiado" ? guidedPersona : advancedPersona;
  const baseTail = useMemo(
    () => buildBaseTail({ handoffNotice: cfg.handoffNotice }),
    [cfg.handoffNotice]
  );

  function patch(p: Partial<AgentConfig>) {
    setCfg((c) => ({ ...c, ...p }));
  }

  function onDraft(campo: "dontDo" | "escalateWhen", v: string) {
    setDrafts((d) => ({ ...d, [campo]: v }));
  }

  function withPendingDrafts(base: AgentConfig): AgentConfig {
    const commit = (arr: string[], draft: string) => {
      const v = draft.trim();
      return v && !arr.includes(v) ? [...arr, v.slice(0, LIMITS.bullet)] : arr;
    };
    return {
      ...base,
      dontDo: commit(base.dontDo, drafts.dontDo),
      escalateWhen: commit(base.escalateWhen, drafts.escalateWhen),
    };
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "avancado") {
      // Nada se perde: leva o prompt compilado para a textarea. SEM o rabo da
      // base, senão ele apareceria duas vezes (uma editável e uma no bloco fixo)
      // e o save o removeria de volta, dando impressão de perda.
      setRawPersona((r) => r || stripBaseTail(guidedPersona).head);
    }
    setError(null);
    setMode(next);
  }

  /**
   * O formulário já tem conteúdo relevante? (para confirmar antes de aplicar um
   * modelo, que substitui campos).
   *
   * ⚠️ Inclui endereço, site e observação de horário de propósito: quem ajustava
   * esses campos antes de escrever "o que a empresa faz" recebia o modelo SEM
   * confirmação nenhuma, e perdia aquilo em silêncio.
   */
  function formHasContent(): boolean {
    return (
      cfg.companyWhat.trim() !== "" ||
      cfg.details.trim() !== "" ||
      cfg.dontDo.length > 0 ||
      cfg.escalateWhen.length > 0 ||
      cfg.companyAddress.trim() !== "" ||
      cfg.companySite.trim() !== "" ||
      cfg.hoursNote.trim() !== ""
    );
  }

  /**
   * Aplica um modelo por segmento: substitui o COMPORTAMENTO (tom, objetivos,
   * regras, detalhes) pelo esqueleto do segmento.
   *
   * ⚠️ Dado do cliente NÃO entra nisso: nome, endereço, site e horário são dele,
   * e não do segmento. Antes o spread de `p.config` (que é EMPTY_CONFIG mais
   * seis campos) zerava horário, endereço, site e o aviso de handoff, e devolvia
   * `neverAdmitAi` ao default. Um modelo não tem opinião sobre o horário de
   * ninguém.
   */
  function applyPreset(p: AgentPreset) {
    setCfg((c) => ({
      ...p.config,
      companyName: c.companyName,
      agentName: c.agentName,
      agentRole: c.agentRole,
      companyAddress: c.companyAddress,
      companySite: c.companySite,
      hours: c.hours,
      hoursNote: c.hoursNote,
      handoffNotice: c.handoffNotice,
      neverAdmitAi: c.neverAdmitAi,
    }));
    setDrafts({ dontDo: "", escalateWhen: "" });
    setPresetAplicado(p.id);
    setFields({});
    setError(null);
  }

  function choosePreset(p: AgentPreset) {
    if (formHasContent()) setPendingPreset(p);
    else applyPreset(p);
  }

  function confirmarPreset() {
    if (pendingPreset) applyPreset(pendingPreset);
    setPendingPreset(null);
  }

  // Mostra o erro E leva ele para a vista. O Salvar é rodapé grudado, então quem
  // aperta pode estar a duas telas do topo, onde o aviso aparece; sem trazer o
  // aviso para a vista, a pessoa clicaria em Salvar e nada pareceria acontecer.
  //
  // ⚠️ Acha o banner pelo `data-slot` em vez de guardar um ref. Um ref
  // devolvido por este hook contamina o retorno inteiro para o
  // `react-hooks/refs` (ver a nota nos rascunhos acima), e a consulta ao DOM aqui
  // é legítima: roda depois da pintura, dentro de um `setTimeout` disparado por
  // um clique, e não durante o render.
  //
  // O `setTimeout(0)` espera o React pintar: no instante da chamada o banner
  // ainda não existe, porque ele só existe quando `error` deixa de ser nulo.
  function falhar(msg: string, campos?: Record<string, string>) {
    setError(msg);
    if (campos) setFields(campos);
    setSaving(false);
    setTimeout(() => {
      document
        .querySelector('[data-slot="erro-agente"]')
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }

  /**
   * Salva. Devolve `ok: true` só quando gravou de verdade, para quem chama poder
   * avançar de passo apenas no sucesso.
   *
   * ⚠️ Devolve os `campos` reprovados JUNTO, e não só no estado. Quem chama
   * precisa deles na mesma tarefa (a tela de abas troca sozinha para a primeira
   * aba com erro), e ler o estado logo depois do `await` devolveria o valor
   * anterior, porque o React ainda não repintou.
   *
   * ⚠️ SALVAR JÁ É PUBLICAR quando o agente já foi ao ar, porque o n8n lê
   * `clients.persona` ao vivo. Antes da primeira ativação não: o `processTurn`
   * devolve turno silencioso, e é isso que torna seguro o assistente gravar no
   * fim da montagem.
   */
  async function save(
    confirmOverwrite = false
  ): Promise<{ ok: boolean; campos: Record<string, string> }> {
    if (preview) return { ok: true, campos: {} };
    setSaving(true);
    setError(null);
    setFields({});

    // Incorpora rascunhos pendentes antes de montar o payload (e reflete na UI).
    let cfgToSave = cfg;
    if (mode === "guiado") {
      cfgToSave = withPendingDrafts(cfg);
      if (cfgToSave !== cfg) setCfg(cfgToSave);
      setDrafts({ dontDo: "", escalateWhen: "" });
    }

    try {
      const payload =
        mode === "guiado"
          ? { mode, config: cfgToSave, confirmOverwrite }
          : { mode, persona: rawPersona };
      const res = await fetch(`/api/clients/${clientId}/agent-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (res.status === 409) {
        // Prompt manual existente → confirma via modal (não window.confirm).
        setSaving(false);
        setConfirmOpen(true);
        return { ok: false, campos: {} };
      }
      if (!res.ok) {
        falhar(data.error ?? "Falha ao salvar.", data.fields);
        return { ok: false, campos: data.fields ?? {} };
      }

      // Grupo de notificação, só quando mudou. Vai DEPOIS do prompt porque é o
      // menos importante dos dois: se falhar, a configuração do agente já está
      // salva e a tela mantém o que a pessoa digitou, com o erro explicando o
      // que não foi.
      if (notifyJid.trim() !== savedJid.trim()) {
        const resJid = await fetch(`/api/clients/${clientId}/notify-target`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jid: notifyJid }),
        });
        const dataJid = (await resJid.json()) as {
          error?: string;
          jid?: string | null;
        };
        if (!resJid.ok) {
          falhar(
            dataJid.error ?? "O agente foi salvo, mas o grupo de avisos não."
          );
          return { ok: false, campos: {} };
        }
        const proximo = dataJid.jid ?? "";
        setSavedJid(proximo);
        setNotifyJid(proximo);
      }

      setSavedAt(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
      if (mode === "guiado") setHadManual(false);
      setSaving(false);
      // Sem router.refresh(): a persona já vale no n8n na hora, e a tela mantém
      // o que o cliente preencheu (recarregar poderia dar impressão de perda).
      return { ok: true, campos: {} };
    } catch {
      falhar("Não foi possível contatar o servidor.");
      return { ok: false, campos: {} };
    }
  }

  /**
   * Carrega uma versão antiga do histórico no formulário. NÃO salva: a pessoa
   * confere e aperta Salvar. O spread sobre EMPTY_CONFIG completa campos que não
   * existiam quando aquela versão foi gravada (handoffNotice, por exemplo).
   */
  function restaurar(v: {
    config: AgentConfig | null;
    persona: string;
    mode: Mode;
  }) {
    setError(null);
    setFields({});
    if (v.mode === "guiado" && v.config) {
      setCfg({ ...EMPTY_CONFIG, ...v.config });
      setMode("guiado");
    } else {
      setRawPersona(v.persona);
      setMode("avancado");
    }
  }

  // O que a bancada vai testar: o estado do formulário, CRU. Compilar aqui e
  // mandar a persona pronta deixaria o browser decidir o prompt final, e o rabo
  // invariante da base é justamente o que não pode depender do browser.
  const configuracao: ConfiguracaoEmEdicao =
    mode === "guiado"
      ? { mode: "guiado", config: cfg }
      : {
          mode: "avancado",
          persona: rawPersona,
          handoffNotice: cfg.handoffNotice,
        };

  return {
    mode,
    switchMode,
    cfg,
    setCfg,
    patch,
    rawPersona,
    setRawPersona,
    tailRemovido,
    notifyJid,
    setNotifyJid,
    saving,
    error,
    fields,
    savedAt,

    hadManual,
    confirmOpen,
    setConfirmOpen,
    pendingPreset,
    setPendingPreset,
    presetAplicado,
    choosePreset,
    confirmarPreset,
    onDraft,
    guidedPersona,
    advancedPersona,
    previewPersona,
    baseTail,
    configuracao,
    save,
    restaurar,
  };
}
