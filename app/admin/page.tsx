import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import ListaEmpresas from "@/components/admin/ListaEmpresas";
import { Button } from "@/components/ui/button";
import { adminDaSessao, paginaDeEmpresas } from "@/lib/admin";
import { PAGINA_EMPRESAS, type EmpresaItem } from "@/lib/admin-empresas";
import { AGENT_MODEL } from "@/lib/agent";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

// /admin (P1 item 6, primeira fatia do Admin v1): as Empresas que usam o CRM,
// com o uso de IA do mês e o limite editável. Só o dono do produto
// (`ADMIN_USER_IDS`): para qualquer outro login é 404 (aqui, no `proxy.ts` e em
// cada rota `/api/admin`). Fora do shell das empresas de propósito: não está no
// menu de nenhum tenant.
export default async function AdminPage() {
  const admin = await adminDaSessao();
  if (!admin) notFound();

  let itens: EmpresaItem[] = [];
  try {
    itens = await paginaDeEmpresas(createServiceClient(), {
      agora: agoraMs(),
      busca: "",
      depois: null,
      modelo: AGENT_MODEL,
    });
  } catch (e) {
    console.error("admin, primeira página:", e);
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas md:gap-3 md:p-3">
      <header className="flex items-center gap-3 px-4 pt-3 md:px-1 md:pt-0">
        <BrandMark size="sm" />
        <span className="text-rotulo uppercase text-ink-3">Admin</span>
        <Button asChild variant="ghost" size="control" className="ml-auto">
          <Link href="/">
            <ArrowLeft size={14} />
            Voltar ao CRM
          </Link>
        </Button>
      </header>
      <ListaEmpresas inicial={{ itens, temMais: itens.length === PAGINA_EMPRESAS }} />
    </div>
  );
}
