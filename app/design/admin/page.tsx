import { notFound } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import ListaEmpresas from "@/components/admin/ListaEmpresas";
import { PAGINA_EMPRESAS, fonteEmpresasDaMemoria, paraEmpresa, type LinhaEmpresa } from "@/lib/admin-empresas";
import { agoraMs } from "@/lib/periodo";

// Preview do /admin (dev-only, liberado pelo proxy). Sem banco e sem sessão:
// as linhas falsas passam pela MESMA conta da tela de verdade (`paraEmpresa`).
// `?cenario=vazia` mostra a lista sem empresas.
export const dynamic = "force-dynamic";

const H = 3_600_000;

export default async function DesignAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  // O resto do /design é liberado pelo proxy só fora de produção; este preview
  // some explicitamente em produção para não revelar que o admin existe.
  if (process.env.NODE_ENV === "production") notFound();
  const { cenario } = await searchParams;
  const agora = agoraMs();
  const iso = (ms: number) => new Date(agora - ms).toISOString();

  const linha = (
    n: number,
    nome: string,
    tokens: [number, number, number],
    extra: Partial<LinhaEmpresa> = {}
  ): LinhaEmpresa => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: nome,
    account_type: "beta",
    billing_plan: null,
    agent_enabled: true,
    agent_published_at: iso(40 * 24 * H),
    ia_limite_tokens: null,
    tokens_entrada: tokens[0],
    tokens_cache: tokens[1],
    tokens_saida: tokens[2],
    ultima_atividade: iso(n * H),
    ...extra,
  });

  const linhas: LinhaEmpresa[] = [
    // Normal, perto de um quarto do padrão.
    linha(1, "Barbearia do Zé", [2_400_000, 1_200_000, 42_000]),
    // Aviso: 85% do padrão.
    linha(2, "Clínica Sorriso", [8_330_000, 4_100_000, 170_000]),
    // Parada: passou do limite gravado (5 mi).
    linha(3, "Dra Maria Jullia", [5_020_000, 2_500_000, 90_000], { ia_limite_tokens: 5_000_000 }),
    // Desligada na chave.
    linha(4, "Loja Teste", [120_000, 40_000, 3_000], { agent_enabled: false, account_type: null }),
    // Interna, limite maior, sem uso ainda.
    linha(5, "OBM", [0, 0, 0], { account_type: "interno", ia_limite_tokens: 50_000_000, ultima_atividade: null }),
    // Nunca publicou.
    linha(6, "Pizzaria Bella", [0, 0, 0], { agent_published_at: null, ultima_atividade: null }),
    ...Array.from({ length: 8 }, (_, i) =>
      linha(10 + i, `Empresa de exemplo ${String(i + 1).padStart(2, "0")}`, [300_000 * (i + 1), 100_000, 5_000 * (i + 1)])
    ),
  ];
  const todas = cenario === "vazia" ? [] : linhas.map((l) => paraEmpresa(l, "gpt-5.4-mini"));
  const primeira = await fonteEmpresasDaMemoria(todas).pagina({ busca: "" }, null);

  return (
    <div className="flex h-dvh flex-col bg-canvas md:gap-3 md:p-3">
      <header className="flex items-center gap-3 px-4 pt-3 md:px-1 md:pt-0">
        <BrandMark size="sm" />
        <span className="text-rotulo uppercase text-ink-3">Admin</span>
      </header>
      <ListaEmpresas
        inicial={{ itens: primeira, temMais: primeira.length === PAGINA_EMPRESAS }}
        previewTodas={todas}
      />
    </div>
  );
}
