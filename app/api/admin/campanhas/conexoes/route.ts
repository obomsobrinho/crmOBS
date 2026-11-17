import { rotaDoAdmin } from "@/lib/admin";
import { conexoesDoAdmin, falhou } from "@/features/campanhas/server/campanhas";
import { createServiceClient } from "@/lib/supabase/service";

// Os números que podem enviar (as empresas do próprio admin com instância), com o
// estado ao vivo na Evolution. Lido pelo navegador depois de abrir a tela.
export const GET = rotaDoAdmin(
  async ({ admin }) => {
    try {
      return Response.json(await conexoesDoAdmin(createServiceClient(), admin));
    } catch (e) {
      return falhou("ler os números", e);
    }
  },
  { semId: true },
);
