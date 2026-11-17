import { rotaDoAdmin } from "@/lib/admin";
import { erroDaRota, lerCorpo } from "@/lib/rota";
import { corpoDaAcao } from "@/features/campanhas/schemas";
import { falhou, iniciarCampanha, pausarCampanha, retomarCampanha } from "@/features/campanhas/server/campanhas";
import { agoraMs } from "@/lib/periodo";
import { problemasParaIniciar } from "@/features/campanhas/regras";
import { createServiceClient } from "@/lib/supabase/service";

// Iniciar (ou agendar), pausar e retomar: `{ acao: "iniciar" | "pausar" | "retomar" }`.
// Iniciar confere de novo, no servidor, o que trava o assistente (`problemasParaIniciar`,
// que usa `problemasDaVariante`) e monta a fila pela regra de `podeEntrarNaCampanha`.
export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const lido = await lerCorpo(req, corpoDaAcao, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const { acao } = lido.dados;
    const svc = createServiceClient();
    const agora = agoraMs();
    try {
      const r =
        acao === "iniciar"
          ? await iniciarCampanha(svc, admin, id, agora, (c) => problemasParaIniciar({ ...c, agora }))
          : acao === "pausar"
            ? await pausarCampanha(svc, admin, id)
            : await retomarCampanha(svc, admin, id, agora);
      return r.ok ? Response.json({ situacao: r.situacao }) : erroDaRota(r.status, r.erro);
    } catch (e) {
      return falhou(`${acao} a campanha`, e);
    }
  },
  { revalidar: true },
);
