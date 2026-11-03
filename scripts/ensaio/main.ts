import { readFileSync, writeFileSync } from "node:fs";
import { createServiceClient } from "@/lib/supabase/service";
import { compilarDoTenant, LIMITS } from "@/lib/agent-prompt";
import { agendaDoTurno } from "@/lib/agenda-servidor";
import { horarioCadastrado } from "@/lib/horarios";
import { processTurn } from "@/lib/agent-turn";
import { blocoDeOrigem, textoParaLead, VARIANTES_SUGERIDAS, type OrigemDaCampanha } from "@/lib/prospeccao";
import type { ChatTurn } from "@/lib/agent";
import { escritasBarradas } from "./servico-somente-leitura";

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
  mensagens: string[];
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

  const svc = createServiceClient();
  const cliente = await clienteAlvo(svc, argumento(args, "cliente"));
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
    `Persona: ${arquivoPersona} (${persona.length} de ${LIMITS.persona} caracteres montados${compilado.ok ? "" : ", ACIMA DO LIMITE"}). Agenda: ${agenda ? "ligada" : "desligada"}.`,
  ];
  if (compilado.ok && compilado.removed && compilado.removed.length > 0) {
    saida.push(`Seções da base retiradas do texto candidato (o rabo de hoje entra no lugar): ${compilado.removed.join(", ")}.`);
  }

  for (const c of entrada.cenarios) {
    const agora = c.agora ?? entrada.agora;
    const origem = origemDoCenario(c, agora);
    saida.push("", `## ${c.nome}`, "");
    if (origem) saida.push("```text", blocoDeOrigem(origem), "```", "");
    // Como na produção (`comEnvioDaCampanha`): o envio é a primeira fala da conversa.
    const history: ChatTurn[] = origem ? [{ role: "assistant", content: origem.texto }] : [];
    const pedidosAbertos: string[] = [];
    for (const mensagem of c.mensagens) {
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
        pedidosAbertos,
      });
      saida.push(`**Lead:** ${mensagem}`, "");
      for (const m of output.messages) saida.push(`> ${m}`);
      const linha = [`action: ${output.action}`];
      if (output.motivo) linha.push(`motivo: ${output.motivo}`);
      if (output.summary) linha.push(`summary: ${output.summary}`);
      const a = output.agenda;
      if (a.acao) linha.push(`agenda: ${a.acao}${a.dia ? ` dia=${a.dia}` : ""}${a.periodo ? ` periodo=${a.periodo}` : ""}${a.hora ? ` hora=${a.hora}` : ""}`);
      if (d.agenda) linha.push(`decisão da agenda: ${d.agenda.decisao}`);
      if (d.guardrail.blocked) linha.push(`guardrail barrou: ${d.guardrail.reason ?? ""}`);
      if (d.limiteIa) linha.push("TURNO SILENCIADO: teto mensal de IA da empresa");
      saida.push("", `\`${linha.join(" · ")}\``, "");
      history.push({ role: "user", content: mensagem });
      if (output.messages.length > 0) history.push({ role: "assistant", content: output.messages.join("\n") });
      if (output.action === "pausar" && d.pedidoNaFila && output.summary) pedidosAbertos.push(output.summary);
    }
  }
  saida.push("", `Escritas barradas (nada foi gravado): ${escritasBarradas.length ? escritasBarradas.join(", ") : "nenhuma"}.`);

  const texto = saida.join("\n");
  const arquivoSaida = argumento(args, "saida");
  if (arquivoSaida) writeFileSync(arquivoSaida, texto, "utf8");
  console.log(texto);
}
