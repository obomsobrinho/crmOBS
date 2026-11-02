import { rotaDoAdmin } from "@/lib/admin";
import { recorteDe } from "@/lib/campanhas-pedidos";
import { falhou, torto } from "@/lib/campanhas-servidor";
import { planilhaDosLeads } from "@/lib/planilha-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// EXPORTAR para Excel os leads do recorte que está na tela (os mesmos filtros da
// tabela, `recorteDe`), até `MAXIMO_DA_EXPORTACAO` linhas. O arquivo sai inteiro
// num pedido (leads são poucos milhares no máximo); só leitura.
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const recorte = recorteDe(req.nextUrl.searchParams);
    if (typeof recorte === "string") return torto(recorte);
    try {
      const arquivo = await planilhaDosLeads(createServiceClient(), recorte);
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
