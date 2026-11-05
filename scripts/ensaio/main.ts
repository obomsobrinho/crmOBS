import { catalogoDasLinhas, marcaDeMidiaEnviada } from "../../lib/midias";
import { readFileSync, writeFileSync } from "node:fs";
import { createServiceClient } from "@/lib/supabase/service";
import { compilarDoTenant, LIMITS } from "@/lib/agent-prompt";
import { agendaDoTurno } from "@/lib/agenda-servidor";
import { horarioCadastrado } from "@/lib/horarios";
import { processTurn } from "@/lib/agent-turn";
import { blocoDeOrigem, textoParaLead, VARIANTES_SUGERIDAS, type OrigemDaCampanha } from "@/lib/prospeccao";
import { AGENT_MODEL, type ChatTurn } from "@/lib/agent";
import { escritasBarradas } from "./servico-somente-leitura";
import { carregarDocumentos } from "./rag-em-memoria";
import { FIM, MODELO_DO_LEAD, proximaFalaDoLead, temperaturaUsada, type LeadSimulado } from "./lead-simulado";

// ENSAIO DO PROMPT (03/11/2026): roda uma persona CANDIDATA contra o turno de
// produção (`processTurn` em dryRun), com o modelo de verdade e as etapas depois
// dele (guardrail, decisão da agenda), sem gravar nada e sem WhatsApp. Uso e
// formato da entrada: scripts/ensaio-do-prompt.mjs.

/** A conversa de teste: DDD 00 nunca chega à Evolution nem gera aviso (`telefoneImpossivel`). */
const TELEFONE_DE_TESTE = "5500000000001";

interface Cenario {
  nome: string;
  /** true = origem de campanha com a 1ª variante sugerida; ou o envio exato. */
  campanha?: boolean | { texto?: string; enviadoEm?: string; empresa?: string };
  /** Falas fixas do lead, uma por turno. */
  mensagens?: string[];
  /** Ou uma pessoa simulada por outro modelo (scripts/ensaio/lead-simulado.ts). */
  lead?: LeadSimulado;
  /** Hora fixa do cenário (ISO); sem ela, a hora de agora. */
  agora?: string;
}

interface Entrada {
  agora?: string;
  cenarios: Cenario[];
}

function argumento(args: string[], nome: string): string | null {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

function origemDoCenario(c: Cenario, agora: string | undefined): OrigemDaCampanha | null {
  if (!c.campanha) return null;
  const o = c.campanha === true ? {} : c.campanha;
  const base = agora ? Date.parse(agora) : Date.now();
  return {
    enviadoEm: o.enviadoEm ?? new Date(base - 2 * 60 * 60_000).toISOString(),
    texto: o.texto ?? textoParaLead(VARIANTES_SUGERIDAS[0], o.empresa ?? "Empresa Exemplo"),
    parouEm: null,
  };
}

async function clienteAlvo(svc: ReturnType<typeof createServiceClient>, informado: string | null) {
  const colunas = "id, name, persona, agent_config, agenda_config, prompt_mode, regras_salvas";
  const { data, error } = await svc
    .from("clients")
    .select(colunas)
    .eq(informado ? "id" : "name", informado ?? "OBS")
    .limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("Não achei UMA empresa: passe --cliente <uuid>.");
  return data[0];
}

export async function ensaiar(args: string[]): Promise<void> {
  const arquivoPersona = argumento(args, "persona");
  const arquivoCenarios = argumento(args, "cenarios");
  if (!arquivoPersona || !arquivoCenarios) {
    throw new Error("Uso: node scripts/ensaio-do-prompt.mjs --persona <arquivo.md> --cenarios <arquivo.json> [--cliente <uuid>] [--saida <arquivo.md>]");
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Defina OPENAI_API_KEY no .env.local");
  const candidata = readFileSync(arquivoPersona, "utf8");
  const entrada = JSON.parse(readFileSync(arquivoCenarios, "utf8")) as Entrada;
  if (!Array.isArray(entrada.cenarios) || entrada.cenarios.length === 0) throw new Error("O JSON precisa de `cenarios` com pelo menos um item.");
  for (const c of entrada.cenarios) {
    if (!c.lead && !Array.isArray(c.mensagens)) throw new Error(`O cenário "${c.nome}" precisa de \`mensagens\` ou de \`lead\`.`);
  }

  // `--documentos a.md,b.md`: base de conhecimento candidata só em memória (scripts/ensaio/rag-em-memoria.ts).
  const documentos = argumento(args, "documentos");
  const resumoDocs = documentos
    ? await carregarDocumentos(documentos.split(",").map((s) => s.trim()).filter(Boolean), apiKey)
    : null;

  const svc = createServiceClient();
  const cliente = await clienteAlvo(svc, argumento(args, "cliente"));
  // `--midias catalogo.json`: mídias de teste no lugar de `agent_midias` (lib/midias.ts). O caminho
  // de cada uma é relativo à pasta da empresa ("biblioteca/x.mp4"); nada é lido do bucket.
  const arquivoMidias = argumento(args, "midias");
  const catalogoOverride = arquivoMidias
    ? (JSON.parse(readFileSync(arquivoMidias, "utf8")) as { path?: string }[]).map((m) => ({
        chave: null, tipo: null, mime: null, nome_arquivo: null, descricao: null, quando_enviar: null, legenda: null,
        ...m,
        path: `${cliente.id}/${String(m.path ?? "").replace(/^\/+/, "")}`,
      }))
    : undefined;
  // A agenda decide o rabo do prompt como no turno de verdade (`personaDoTenant`).
  const agenda = await agendaDoTurno({
    svc,
    clientId: cliente.id,
    phone: TELEFONE_DE_TESTE,
    agora: Date.now(),
    hours: horarioCadastrado(cliente.agent_config),
    configGravada: cliente.agenda_config,
  });
  // A mesma montagem da produção, só com o texto candidato no lugar de `clients.persona`.
  const compilado = compilarDoTenant({ ...cliente, persona: candidata, prompt_mode: "avancado" }, undefined, agenda !== null);
  if (!compilado.ok && compilado.motivo !== "longo") throw new Error(`A persona candidata não compila (${compilado.motivo}).`);
  const persona = compilado.persona;

  const saida: string[] = [
    `# Ensaio do prompt: ${cliente.name}`,
    "",
    `Persona: ${arquivoPersona} (${persona.length} de ${LIMITS.persona} caracteres montados${compilado.ok ? "" : ", ACIMA DO LIMITE"}). Agenda: ${agenda ? "ligada" : "desligada"}. Modelo do agente: ${AGENT_MODEL}.`,
  ];
  saida.push(
    resumoDocs
      ? `Base de conhecimento: SÓ os documentos do ensaio, em memória (${resumoDocs.join("; ")}); os trechos gravados da empresa foram ignorados.`
      : "Base de conhecimento: a gravada da empresa (knowledge_chunks).",
  );
  if (compilado.ok && compilado.removed && compilado.removed.length > 0) {
    saida.push(`Seções da base retiradas do texto candidato (o rabo de hoje entra no lugar): ${compilado.removed.join(", ")}.`);
  }

  const repeticoes = Math.max(1, Number.parseInt(argumento(args, "repeticoes") ?? "1", 10) || 1);
  const temLead = entrada.cenarios.some((c) => c.lead);
  if (temLead) saida.push(`Lead simulado: ${MODELO_DO_LEAD} (vê só a conversa, nunca o prompt do agente).`);
  if (repeticoes > 1) saida.push(`Repetições: ${repeticoes} por cenário, cada uma do zero.`);

  for (const c of entrada.cenarios) {
    for (let rodada = 1; rodada <= repeticoes; rodada++) {
      const agora = c.agora ?? entrada.agora;
      const origem = origemDoCenario(c, agora);
      saida.push("", `## ${c.nome}${repeticoes > 1 ? ` (rodada ${rodada} de ${repeticoes})` : ""}`, "");
      if (c.lead && rodada === 1) saida.push(`Pessoa simulada: ${c.lead.persona.trim()}`, "");
      if (origem) saida.push("```text", blocoDeOrigem(origem), "```", "");
      // Como na produção (`comEnvioDaCampanha`): o envio é a primeira fala da conversa.
      const history: ChatTurn[] = origem ? [{ role: "assistant", content: origem.texto }] : [];
      const pedidosAbertos: string[] = [];
      // Mídias já enviadas nesta conversa de teste (uma vez por conversa, lib/midias.ts).
      const midiasEnviadas: string[] = [];
      const acoes: string[] = [];
      const teto = c.lead ? Math.max(1, c.lead.maxTurnos ?? 8) : c.mensagens!.length;
      let fim = c.lead ? `teto de ${teto} mensagens da pessoa` : "mensagens fixas";
      for (let turno = 0; turno < teto; turno++) {
        const mensagem = c.lead ? await proximaFalaDoLead(apiKey, c.lead, history) : c.mensagens![turno];
        if (c.lead && mensagem.includes(FIM)) {
          fim = `a pessoa parou de responder (${FIM}) depois de ${turno} mensagens`;
          break;
        }
        const { output, diagnostics: d } = await processTurn({
          clientId: cliente.id,
          phone: TELEFONE_DE_TESTE,
          message: mensagem,
          apiKey,
          dryRun: true,
          history,
          personaOverride: persona,
          agoraTeste: agora ?? null,
          origemOverride: origem,
          catalogoOverride,
          pedidosAbertos,
          midiasEnviadas,
        });
        saida.push(`**Lead:** ${mensagem}`, "");
        for (const m of output.messages) saida.push(`> ${m}`);
        const linha = [`action: ${output.action}`];
        if (output.motivo) linha.push(`motivo: ${output.motivo}`);
        if (output.summary) linha.push(`summary: ${output.summary}`);
        const a = output.agenda;
        if (a.acao) linha.push(`agenda: ${a.acao}${a.dia ? ` dia=${a.dia}` : ""}${a.periodo ? ` periodo=${a.periodo}` : ""}${a.hora ? ` hora=${a.hora}` : ""}`);
        if (d.agenda) linha.push(`decisão da agenda: ${d.agenda.decisao}`);
        if (d.midia) linha.push(`midia: ${d.midia.enviada ?? "nenhuma"}${d.midia.pedida && d.midia.pedida !== d.midia.enviada ? ` (pediu ${d.midia.pedida}, recusada)` : ""}`);
        if (d.guardrail.blocked) linha.push(`guardrail barrou: ${d.guardrail.reason ?? ""}`);
        if (d.limiteIa) linha.push("TURNO SILENCIADO: teto mensal de IA da empresa");
        saida.push("", `\`${linha.join(" · ")}\``, "");
        if (d.ragSearched) {
          saida.push(d.ragMatches.length ? "Trechos da base:" : "Trechos da base: nenhum.");
          for (const m of d.ragMatches) saida.push(`- ${m.similarity.toFixed(3)} · ${m.preview.replace(/\s+/g, " ").slice(0, 80)}`);
          saida.push("");
        }
        history.push({ role: "user", content: mensagem });
        if (output.messages.length > 0) history.push({ role: "assistant", content: output.messages.join("\n") });
        // Como em produção: a mídia enviada entra no histórico como fala da empresa.
        if (output.midia) {
          midiasEnviadas.push(output.midia);
          history.push({ role: "assistant", content: marcaDeMidiaEnviada(catalogoDasLinhas(cliente.id, catalogoOverride ?? []).find((m) => m.chave === output.midia) ?? null) });
          saida.push(`> [mídia: ${output.midia}]`, "");
        }
        if (output.action === "pausar" && d.pedidoNaFila && output.summary) pedidosAbertos.push(output.summary);
        acoes.push(output.action);
      }
      saida.push(`_Fim: ${fim}. Ações do agente: ${acoes.join(", ") || "nenhuma"}._`);
    }
  }
  if (temLead) saida.push("", `Temperatura do lead simulado: ${temperaturaUsada()}.`);
  saida.push("", `Escritas barradas (nada foi gravado): ${escritasBarradas.length ? escritasBarradas.join(", ") : "nenhuma"}.`);

  const texto = saida.join("\n");
  const arquivoSaida = argumento(args, "saida");
  if (arquivoSaida) writeFileSync(arquivoSaida, texto, "utf8");
  console.log(texto);
}
