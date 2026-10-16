import { NextResponse } from "next/server";
import { modeloDoCliente, rotaDoAdmin, usoDoCliente, usoHistoricoDoCliente } from "@/lib/admin";
import { ehMesIso, mesAtualSP, usoParaTela } from "@/lib/admin-cliente";
import { AGENT_MODEL } from "@/lib/agent";
import { diaIsoSP } from "@/lib/fuso";
import { janelaDoIntervalo } from "@/lib/picos";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas/[id]/uso: o uso de IA de UM cliente para a aba "Uso de IA" da central do dono.
// Só o admin (`ADMIN_USER_IDS`, guarda `rotaDoAdmin`: 404 para outro login, 400 para id torto). O
// agregado é do banco (service_role, janela limitada); as somas e o custo estimado saem de
// `lib/admin-cliente.ts` sobre `lib/custo-ia.ts`, com o preço do modelo DO CLIENTE (o do último turno,
// `modeloDoCliente`, lido em paralelo com o agregado, nunca antes dele).
//
// Sem parâmetro: os QUATRO períodos dos chips (Dia = hoje desde as 00h, por hora; os outros por dia, cada
// um com a base da variação), os picos de cada chip (`admin_cliente_picos`) e o dia do primeiro turno
// (que limita os meses do seletor).
// `?mes=AAAA-MM`: um mês civil (o atual ou um passado), uma coluna por dia.
// `?tudo=1`: todo o período, uma coluna por mês, do mês da primeira atividade ao atual.
// `?de=AAAA-MM-DD&ate=AAAA-MM-DD`: um intervalo de datas (cortado em hoje, até 1830 dias).
// As três últimas devolvem `{ uso, picos, janela }`. Parâmetro torto é 400, nunca 500.
export const GET = rotaDoAdmin(async ({ id, req }) => {
  const agora = agoraMs();
  const params = req.nextUrl.searchParams;
  const mes = params.get("mes");
  const tudo = params.get("tudo");
  const de = params.get("de");
  const ate = params.get("ate");
  const pedidos = [mes !== null, tudo !== null, de !== null || ate !== null].filter(Boolean).length;
  if (
    pedidos > 1 ||
    (mes !== null && (!ehMesIso(mes) || mes > mesAtualSP(agora))) ||
    (tudo !== null && tudo !== "1") ||
    ((de !== null || ate !== null) && janelaDoIntervalo(de, ate, diaIsoSP(agora)) === null)
  ) {
    return NextResponse.json({ error: "parâmetro inválido" }, { status: 400 });
  }
  try {
    const svc = createServiceClient();
    if (mes !== null) {
      return NextResponse.json(await usoHistoricoDoCliente(svc, id, agora, AGENT_MODEL, { tipo: "mes", mes }));
    }
    if (tudo !== null) {
      return NextResponse.json(await usoHistoricoDoCliente(svc, id, agora, AGENT_MODEL, { tipo: "tudo" }));
    }
    if (de !== null && ate !== null) {
      return NextResponse.json(await usoHistoricoDoCliente(svc, id, agora, AGENT_MODEL, { tipo: "intervalo", de, ate }));
    }
    const [bruto, modelo] = await Promise.all([
      usoDoCliente(svc, id, agora),
      modeloDoCliente(svc, id, AGENT_MODEL, agora),
    ]);
    return NextResponse.json(usoParaTela(bruto, agora, modelo.nome));
  } catch (e) {
    console.error("admin, uso de IA do cliente:", e);
    return NextResponse.json({ error: "falha ao ler o uso de IA" }, { status: 500 });
  }
});
