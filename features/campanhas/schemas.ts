import { z } from "zod";
import { ehPeriodo, type PeriodoKey } from "@/lib/periodo";
import { MAXIMO_DO_ARQUIVO_BYTES } from "./planilha-de-leads";
import {
  ehId,
  ehSituacaoDaBusca,
  ehSituacaoDaCampanha,
  ehSituacaoNaCampanha,
  filtroDe,
  opcoesDe,
  paginaDe,
  rascunhoDe,
  recorteDe,
  textoDe,
} from "./pedidos";
import { problemaDoCelular, problemasDaBusca, telefoneDoLead } from "./regras";

// OS ESQUEMAS DAS ROTAS DE CAMPANHAS (docs/plano-dados-e-estado.md, 2.9): toda query
// e todo corpo de `/api/admin/campanhas/*` cruzam um destes antes de chegar ao
// servidor, e o tipo sai do esquema. As regras finas continuam num lugar só,
// `pedidos.ts` e `regras.ts` (puros, testados em `e2e/campanhas-lib.design.spec.ts`):
// o esquema as chama em vez de repeti-las. Cada mensagem é a frase que a tela mostra
// (as rotas leem com `motivo: true`), as mesmas de antes do Zod.

/** Um corpo que não é objeto (JSON torto, `null`) vira `{}`: cada campo diz o seu motivo. */
const objeto = <S extends z.ZodRawShape>(forma: S) =>
  z.preprocess((v) => (v !== null && typeof v === "object" ? v : {}), z.object(forma));

const pagina = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const n = paginaDe(v ?? null);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "página inválida" });
      return z.NEVER;
    }
    return n;
  });
const texto = z
  .string()
  .optional()
  .transform((v) => textoDe(v ?? null));
const situacao = <T extends string>(eh: (v: unknown) => v is T) =>
  z
    .string()
    .optional()
    .refine((v) => v === undefined || eh(v), "situação inválida")
    .transform((v) => (v ?? null) as T | null);
const idOpcional = (motivo: string) =>
  z
    .string()
    .optional()
    .refine((v) => v === undefined || ehId(v), motivo)
    .transform((v) => v ?? null);

/** `GET /campanhas`: a tabela (10 por página), ou `?com_envio=1`. */
export const consultaDasCampanhas = z.object({
  com_envio: z.string().optional(),
  pagina,
  texto,
  situacao: situacao(ehSituacaoDaCampanha),
});

/** `GET /buscas`: a tabela de listas, ou `?escolher=1`. */
export const consultaDasBuscas = z.object({
  escolher: z.string().optional(),
  pagina,
  texto,
  situacao: situacao(ehSituacaoDaBusca),
});

/** `GET /{id}/leads`: os leads de uma campanha. */
export const consultaDosLeadsDaCampanha = z.object({ pagina, texto, situacao: situacao(ehSituacaoNaCampanha) });

/** O recorte da tabela de leads (`recorteDe`, o par de `recorteParaQuery`). */
export const recorte = z.record(z.string(), z.string()).transform((q, ctx) => {
  const r = recorteDe(new URLSearchParams(q));
  if (typeof r === "string") {
    ctx.addIssue({ code: "custom", message: r });
    return z.NEVER;
  }
  return r;
});

/** `GET /leads`: o recorte, mais a página ou um dos pedidos de filtro (`?cidades=1`, `?categoriasDoRecorte=1`). */
export const consultaDosLeads = z
  .object({ cidades: z.string().optional(), categoriasDoRecorte: z.string().optional(), pagina: z.string().optional() })
  .passthrough()
  .transform((q, ctx) => {
    const { cidades, categoriasDoRecorte, pagina: p, ...resto } = q;
    const r = recorte.safeParse(resto);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: r.error.issues[0]?.message ?? "recorte inválido" });
      return z.NEVER;
    }
    return { recorte: r.data, cidades: cidades === "1", categorias: categoriasDoRecorte === "1", pagina: paginaDe(p ?? null) };
  });

/** `?busca=` opcional (o painel da base, tirar um lead de uma lista). */
export const consultaDaBusca = z.object({ busca: idOpcional("busca inválida") });

/** `GET /resultados`: uma campanha (ou todas) e o período. */
export const consultaDosResultados = z.object({
  campanha: idOpcional("campanha inválida"),
  periodo: z
    .string()
    .optional()
    .refine((v) => v === undefined || ehPeriodo(v), "período inválido")
    .transform((v) => (v ?? null) as PeriodoKey | null),
});

/** `GET /previa`: quantos entram no recorte do passo Contatos. */
export const consultaDaPrevia = z
  .object({ busca: z.string().optional(), bons: z.string().optional(), sem_site: z.string().optional(), origem: z.string().optional() })
  .transform((q, ctx) => {
    const filtro = filtroDe({
      buscaId: q.busca ?? "todas",
      soMarcadosComoBons: q.bons === "1",
      soSemSiteProprio: q.sem_site === "1",
      quemNaoRespondeuDe: q.origem ?? null,
    });
    if (!filtro) {
      ctx.addIssue({ code: "custom", message: "recorte inválido" });
      return z.NEVER;
    }
    return filtro;
  });

/** `POST /buscas`: as opções da Nova busca, conferidas e sem problema para começar. */
export const corpoDaNovaBusca = objeto({ opcoes: z.unknown().optional() }).transform((c, ctx) => {
  const opcoes = opcoesDe(c.opcoes);
  const problema = opcoes ? problemasDaBusca(opcoes)[0] : "opções da busca inválidas";
  if (!opcoes || problema) {
    ctx.addIssue({ code: "custom", message: problema ?? "opções da busca inválidas" });
    return z.NEVER;
  }
  return opcoes;
});

/** `PUT /leads/{id}`: marcar como bom, descartado, ou tirar a marca (null). */
export const corpoDaMarcacao = objeto({
  marcacao: z.union([z.literal("bom"), z.literal("descartado"), z.null()], "marcação inválida"),
});

/** `PATCH /leads/{id}`: o celular digitado, já no formato do lead. */
export const corpoDoTelefone = objeto({ telefone: z.string("telefone inválido") }).transform((c, ctx) => {
  const problema = problemaDoCelular(c.telefone);
  const celular = telefoneDoLead(c.telefone);
  if (problema || !celular) {
    ctx.addIssue({ code: "custom", message: problema ?? "telefone inválido" });
    return z.NEVER;
  }
  return celular;
});

/** `PUT /{id}/acao`. */
export const corpoDaAcao = objeto({ acao: z.enum(["iniciar", "pausar", "retomar"], "ação inválida") });

/** `PUT /{id}`: o rascunho do assistente (`rascunhoDe`, com o id da rota). */
export const corpoDoRascunho = (id: string) =>
  z.unknown().transform((v, ctx) => {
    const r = rascunhoDe(id, v);
    if (!r) {
      ctx.addIssue({ code: "custom", message: "rascunho inválido" });
      return z.NEVER;
    }
    return r;
  });

/** `POST /planilha`: o arquivo (.xlsx, até 4 MB); `confirmar=1` grava, sem ele é a prévia. */
export const formularioDaPlanilha = z
  .object({
    arquivo: z
      .instanceof(File, { error: "falta o arquivo" })
      .refine((a) => a.size <= MAXIMO_DO_ARQUIVO_BYTES, "O arquivo passa de 4 MB. Divida a planilha em partes.")
      .refine((a) => /\.xlsx$/i.test(a.name), "Envie uma planilha do Excel (.xlsx)."),
    confirmar: z.unknown().optional(),
    nome: z.unknown().optional(),
  })
  .transform((f) => ({
    arquivo: f.arquivo,
    confirmar: f.confirmar === "1",
    nome: String(f.nome ?? "").trim().slice(0, 80) || `Planilha ${f.arquivo.name}`.slice(0, 80),
  }));

/**
 * A query do webhook do Apify (`POST /api/prospeccao/apify?busca=<id>`): o endereço é
 * montado por nós ao criar a execução, então este é o formato real. MODO SOMBRA
 * (`conferirNaSombra`): só registra; a rota continua recusando a busca torta como antes.
 */
export const consultaDoWebhookDoApify = z.object({ busca: z.string().refine(ehId, "busca inválida") });
