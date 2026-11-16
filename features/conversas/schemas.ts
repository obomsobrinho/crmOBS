import { z } from "zod";
import { campo, corpoJson } from "@/lib/esquema";

// OS WEBHOOKS DO N8N EM MODO SOMBRA (docs/plano-dados-e-estado.md, 2.9 e passo 4). O n8n
// é produção e é o cano do atendimento: estes esquemas SÓ registram o que fugir deles
// (`conferirNaSombra`, `lib/rota.ts`), nunca recusam. Quem decide o que a rota faz com
// o corpo continua sendo o código de cada rota, como antes. Cada campo aqui é um campo
// que a rota já lê; nada foi suposto sobre o que o n8n manda além disso.

const textoComConteudo = z.string().trim().min(1);

/** `POST /api/agent`: o turno do cérebro. Os três primeiros são os que a rota exige. */
export const corpoDoAgente = z.object({
  client_id: textoComConteudo,
  phone: textoComConteudo,
  message: textoComConteudo,
  instance: z.string().optional(),
  nomewpp: z.string().nullish(),
  dryRun: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
  currentStage: z.string().nullish(),
  stageSource: z.string().nullish(),
});

/** `POST /api/inbound-media`: a mídia que o contato mandou (`lib/midia-recebida.ts`). */
export const corpoDaMidiaRecebida = z
  .object({
    client_id: textoComConteudo,
    mime: z.string().nullish(),
    filename: z.string().nullish(),
    type: z.string().nullish(),
    assinar: z.boolean().optional(),
    base64: z.string().nullish(),
  })
  .refine((c) => c.assinar === true || !!c.base64, "sem assinar e sem base64: a rota não sobe nada");

/** `GET /api/clients/by-instance/[instanceName]`: o nome da instância na Evolution. */
export const parametroDaInstancia = z.object({ instanceName: textoComConteudo });

/**
 * `POST /api/send` (varredura do passo 5): o envio manual da tela. O esquema decide o JSON
 * e entrega os campos como vieram; texto, mídia, aceite e o pedido continuam conferidos no
 * handler, com as frases de antes.
 */
export const corpoDoEnvioManual = corpoJson(
  {
    phone: campo<string>(),
    text: campo<string>(),
    /** "Eu respondo": o pedido de ajuda que esta resposta resolve. */
    pedidoId: campo<number>(),
    /** "Esta pessoa sabe que eu vou escrever". */
    aceite: campo<boolean>(),
    media: campo<{ bucket?: string; path?: string; type?: string; mime?: string; filename?: string }>(),
  },
  "JSON inválido",
);
