import { User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import ChangePassword from "@/components/ChangePassword";
import { statusLabel } from "@/lib/billing";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function PerfilPage() {
  const client = await getMyClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows: { label: string; value: string }[] = [
    { label: "Empresa", value: client?.name ?? "—" },
    { label: "E-mail", value: user?.email ?? "—" },
    { label: "Instância WhatsApp", value: client?.evolution_instance ?? "—" },
    { label: "Conta criada em", value: fmtDate(user?.created_at) },
    {
      label: "Assinatura",
      value: client ? statusLabel(client.subscriptionStatus) : "—",
    },
  ];

  return (
    <div className={cn(cardVariants(), "flex min-h-0 flex-1 flex-col overflow-hidden p-6")}>
      <div className="mb-1 flex items-center gap-2">
        <User size={20} className="text-brand-ink" />
        <h1 className="text-titulo">Perfil</h1>
      </div>
      <p className="mb-5 text-apoio text-ink-2">Dados da sua conta.</p>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        <div className="max-w-xl rounded-xl border border-line bg-bloco">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <span className="text-apoio text-ink-2">{r.label}</span>
              <span className="text-apoio font-medium">{r.value}</span>
            </div>
          ))}
        </div>

        <ChangePassword email={user?.email ?? ""} />
      </div>
    </div>
  );
}
