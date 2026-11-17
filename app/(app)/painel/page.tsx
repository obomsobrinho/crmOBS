import GuardaDaTela from "@/components/GuardaDaTela";
import TelaDoPainel from "@/features/painel/components/TelaDoPainel";

export const dynamic = "force-dynamic";

// Painel do tenant. Tudo por RLS; o cálculo mora em módulos puros (lib/valor,
// lib/metrics, lib/periodo, lib/delta, lib/mensagem, lib/painel).
//
// Área migrada no passo 3b de docs/plano-dados-e-estado.md (15/11/2026): a página NÃO
// lê o banco (D8). A sessão vem do layout do `(app)`, a guarda decide no navegador
// (conta bloqueada vai para `/assinatura`, como `requireActiveTenant`), e o painel lê
// pelo cache (`features/painel/api/painel.ts`).
export default function PainelPage() {
  return (
    <GuardaDaTela ativa>
      <TelaDoPainel />
    </GuardaDaTela>
  );
}
