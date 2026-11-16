import { z } from "zod";
import type { ChatTurn } from "./agent";
import { campo, corpoJson } from "./esquema";

// OS CORPOS DAS ROTAS DO AGENTE, DA BASE DE CONHECIMENTO E DA BANCADA
// (docs/plano-dados-e-estado.md, 2.9; varredura do passo 5). Cada rota responde as frases
// que já dizia: o esquema decide só o que vinha antes de qualquer leitura (o JSON, o modo,
// o `enabled`), e o resto (montar a persona, conferir o grupo na Evolution, o tamanho do
// arquivo) continua no handler, na mesma ordem. O agente ainda não mudou para `features/`,
// então o esquema mora ao lado de `lib/agent-prompt.ts`.

const SEM_JSON = "JSON inválido";

/** `PUT /api/clients/[id]/agent-config`: o modo decide o resto. */
export const corpoDaConfigDoAgente = corpoJson(
  {
    mode: z
      .unknown()
      .refine((v): v is "guiado" | "avancado" | "horario" => v === "guiado" || v === "avancado" || v === "horario", "modo inválido"),
    config: campo<unknown>(),
    persona: campo<string>(),
    confirmOverwrite: campo<boolean>(),
    /** Só no mode "horario". */
    hours: campo<unknown>(),
  },
  SEM_JSON,
).transform((c) => ({ ...c, mode: c.mode as "guiado" | "avancado" | "horario" }));

/** `POST`/`DELETE /api/clients/[id]/agent-rules`: o texto é conferido por `mudarRegras`. */
export const corpoDasRegras = corpoJson({ texto: campo<unknown>(), pedidoId: campo<unknown>() }, SEM_JSON);

/** `PUT /api/clients/[id]/publish`. */
export const corpoDoPublicar = corpoJson(
  { enabled: z.unknown().refine((v): v is boolean => typeof v === "boolean", "informe enabled") },
  SEM_JSON,
).transform((c) => ({ enabled: c.enabled as boolean }));

/** `PUT /api/clients/[id]/notify-target`: número OU grupo, conferidos no handler (o grupo contra a lista). */
export const corpoDoDestinoDosAvisos = corpoJson({ numero: campo<unknown>(), grupo: campo<unknown>() }, SEM_JSON);

/**
 * `POST /api/clients/[id]/connect-whatsapp`: corpo opcional (sem ele, o QR). Um corpo que
 * não é JSON (ou não é objeto) vale "sem corpo", como antes.
 */
export const corpoDoConectar = z.preprocess(
  (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : {}),
  z.looseObject({ number: campo<unknown>() }),
);

/** `DELETE /api/clients/[id]/knowledge` e `POST .../knowledge/process`. */
export const corpoDoDocumento = corpoJson({ document_id: campo<string>() }, SEM_JSON);

/** `POST .../knowledge/upload-url` e `.../whatsapp-media/upload-url`: nome, tipo e tamanho, conferidos no handler. */
export const corpoDoEnvioDeArquivo = corpoJson(
  { filename: campo<string>(), mime: campo<string>(), size: campo<number>() },
  SEM_JSON,
);

/** `POST /api/playground`: a bancada testa a configuração EM EDIÇÃO (o servidor compila). */
export const corpoDaBancada = corpoJson(
  {
    message: campo<string>(),
    history: campo<ChatTurn[]>(),
    currentStage: campo<string | null>(),
    stageSource: campo<string | null>(),
    instruction: campo<string | null>(),
    /** A bancada orientou um pedido de ajuda: a IA responde SEM mensagem nova do cliente. */
    retomada: campo<{ instruction?: string } | null>(),
    /** Pedidos de ajuda abertos na conversa de teste. */
    pedidosAbertos: campo<string[]>(),
    /** Configuração em edição: "guiado" usa `config`, "avancado" usa `persona`. */
    mode: campo<string>(),
    config: campo<unknown>(),
    persona: campo<string>(),
    /** Base do aviso de handoff em edição (só usada no modo avançado). */
    handoffNotice: campo<string>(),
    /** Regras salvas pelo time (os dois modos). Ausente = as do tenant, do banco. */
    regrasSalvas: campo<unknown>(),
    /** Hora fixa do turno (ISO), para a bateria de testes de data e horário. */
    agoraTeste: campo<string>(),
    /** Horário fixo no modo avançado (a bateria não depende do horário salvo). Sempre dryRun. */
    hours: campo<unknown>(),
    /** Agenda ligada de teste (`{ config, servicos }`), para a suíte paga. Sempre dryRun. */
    agendaTeste: campo<{ config?: unknown; servicos?: unknown }>(),
  },
  SEM_JSON,
);

/**
 * `POST /api/playground/transcrever` (multipart): o campo `audio`. O formulário torto
 * ("envio inválido") e o tamanho (413) continuam no handler, com os status de antes.
 */
export const formularioDoAudio = z.object({
  audio: z.unknown().refine((v): v is File => v instanceof File && v.size > 0, "áudio vazio"),
});
