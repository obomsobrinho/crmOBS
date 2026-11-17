import { z } from "zod";
import { ehUuid } from "@/lib/admin-acesso";
import { ehFiltroDeSituacao } from "@/lib/admin-alertas";
import { pedidoDeAcao } from "@/lib/admin-conta";
import { limiteValido } from "@/lib/admin-empresas";
import { cursorDaConsulta } from "@/lib/admin-pedidos";
import { campo, corpoJson } from "@/lib/esquema";

// AS ENTRADAS DAS ROTAS DA CENTRAL (`/api/admin/empresas/*`; docs/plano-dados-e-estado.md,
// 2.9, varredura do passo 5). As frases são as que as rotas já diziam (as rotas leem com
// `motivo: true`), e as regras finas continuam nos módulos puros da central (`pedidoDeAcao`,
// `limiteValido`, `cursorDaConsulta`): o esquema as chama, nunca as repete.

const SEM_JSON = "JSON inválido";

/** `GET /api/admin/empresas`: a página da lista (o tamanho `n` e a busca são cortados no handler, como antes). */
export const consultaDaLista = z.object({
  busca: z.string().optional(),
  depoisNome: z.string().optional(),
  depoisId: z.string().optional().refine((v) => v === undefined || ehUuid(v), "cursor inválido"),
  situacao: z.string().optional().refine((v) => v === undefined || ehFiltroDeSituacao(v), "situação inválida"),
  n: z.string().optional(),
});

/** `GET .../pedidos?em=&id=`: a página seguinte dos pedidos abertos. */
export const consultaDosPedidos = z
  .object({ em: z.string().optional(), id: z.string().optional() })
  .transform((q, ctx) => {
    const depois = cursorDaConsulta(q.em ?? null, q.id ?? null);
    if (depois === "invalido") {
      ctx.addIssue({ code: "custom", message: "cursor inválido" });
      return z.NEVER;
    }
    return depois;
  });

/** `GET .../uso`: `?mes=`, `?tudo=1` ou `?de=&ate=`; a conferência depende do relógio e fica no handler. */
export const consultaDoUso = z.object({
  mes: z.string().optional(),
  tudo: z.string().optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
});

/** `PUT .../conta`: a regra é `pedidoDeAcao` (o corpo inteiro, como antes). */
export const corpoDaConta = z.unknown().transform((v, ctx) => {
  const p = pedidoDeAcao(v);
  if ("erro" in p) {
    ctx.addIssue({ code: "custom", message: p.erro });
    return z.NEVER;
  }
  return p;
});

/** `PUT .../limite`. */
export const corpoDoLimite = corpoJson(
  {
    limite: z
      .unknown()
      .refine(limiteValido, "limite inválido: um número inteiro de tokens maior que zero, ou null para o padrão"),
  },
  SEM_JSON,
).transform((c) => ({ limite: c.limite as number | null }));

/** `POST .../apagar`: o nome digitado vai como veio (a função SQL confere de novo). */
export const corpoDoApagar = corpoJson(
  {
    nome: campo<unknown>().transform((v) => v).refine(
      (v) => typeof v === "string" && v.trim() !== "",
      "digite o nome do cliente para confirmar",
    ),
  },
  SEM_JSON,
).transform((c) => ({ nome: c.nome as string }));
