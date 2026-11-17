import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { recorte } from "@/features/campanhas/schemas";
import { falhou } from "@/features/campanhas/server/campanhas";
import { planilhaDosLeads } from "@/features/campanhas/server/planilha";
import { createServiceClient } from "@/lib/supabase/service";

// EXPORTAR para Excel os leads do recorte que está na tela (os mesmos filtros da
// tabela, `recorteDe`), até `MAXIMO_DA_EXPORTACAO` linhas. O arquivo sai inteiro
// num pedido (leads são poucos milhares no máximo); só leitura.
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, recorte, { motivo: true });
    if ("erro" in lido) return lido.erro;
    try {
      const arquivo = await planilhaDosLeads(createServiceClient(), lido.dados);
      return new Response(arquivo, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="leads.xlsx"',
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return falhou("exportar os leads", e);
    }
  },
  { semId: true },
);
