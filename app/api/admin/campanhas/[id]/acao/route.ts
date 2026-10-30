import { rotaDoAdmin } from "@/lib/admin";
import { campoDe } from "@/lib/campanhas-pedidos";
import { falhou, iniciarCampanha, pausarCampanha, retomarCampanha, torto } from "@/lib/campanhas-servidor";
import { agoraMs } from "@/lib/periodo";
import { problemasParaIniciar } from "@/lib/prospeccao";
import { createServiceClient } from "@/lib/supabase/service";

// Iniciar (ou agendar), pausar e retomar: `{ acao: "iniciar" | "pausar" | "retomar" }`.
// Iniciar confere de novo, no servidor, o que trava o assistente (`problemasParaIniciar`,
// que usa `problemasDaVariante`) e monta a fila pela regra de `podeEntrarNaCampanha`.
export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const corpo: unknown = await req.json().catch(() => null);
    const acao = campoDe(corpo, "acao");
    if (acao !== "iniciar" && acao !== "pausar" && acao !== "retomar") return torto("ação inválida");
    const svc = createServiceClient();
    const agora = agoraMs();
    try {
      const r =
        acao === "iniciar"
          ? await iniciarCampanha(svc, admin, id, agora, (c) => problemasParaIniciar({ ...c, agora }))
          : acao === "pausar"
            ? await pausarCampanha(svc, admin, id)
            : await retomarCampanha(svc, admin, id, agora);
      return r.ok ? Response.json({ situacao: r.situacao }) : Response.json({ error: r.erro }, { status: r.status });
    } catch (e) {
      return falhou(`${acao} a campanha`, e);
    }
  },
  { revalidar: true },
);
