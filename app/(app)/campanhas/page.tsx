import CampanhasAoVivo from "@/components/admin/campanhas/CampanhasAoVivo";
import { adminDaPagina } from "@/lib/admin";
import { agoraMs } from "@/lib/periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanhas", robots: { index: false } };

// CAMPANHAS (docs/plano-campanhas.md, D1): a prospecção do dono do produto, só para
// `ADMIN_USER_IDS`. Quem não é admin NÃO recebe 404 (revelaria o caminho):
// `adminDaPagina` o redireciona para `/contatos`. Nada é lido aqui: a tela lê pelas
// rotas `/api/admin/campanhas/*`, que conferem o admin de novo, cada uma.
export default async function CampanhasPage() {
  await adminDaPagina();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CampanhasAoVivo agora={agoraMs()} />
    </div>
  );
}
