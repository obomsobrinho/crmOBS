import WhatsAppBanner, { type EstadoWhatsApp } from "@/components/WhatsAppBanner";
import ConexaoCampo from "@/components/agente/ConexaoCampo";

// Preview do aviso de WhatsApp caído (dev-only, liberado pelo proxy). Os quatro
// estados com `estadoForcado`, sem Evolution no meio: queda real não dá para
// forçar na Loja Teste, então é aqui que se prova que cada estado renderiza (e
// que `open` não renderiza nada).
export const dynamic = "force-dynamic";

const ESTADOS: { estado: EstadoWhatsApp; legenda: string }[] = [
  { estado: "close", legenda: "close: a instância caiu" },
  { estado: "connecting", legenda: "connecting: o aparelho está voltando" },
  { estado: "unknown", legenda: "unknown: a Evolution não respondeu" },
  { estado: "open", legenda: "open: nada é renderizado" },
];

export default function DesignConexaoPage() {
  return (
    <div className="min-h-screen bg-canvas p-6">
      <h1 className="mb-1 text-titulo">Aviso de WhatsApp caído</h1>
      <p className="mb-6 text-apoio text-ink-2">
        Mesmo lugar e peso do aviso de assinatura, em toda página do app,
        enquanto o estado da instância for diferente de open.
      </p>
      <div className="flex max-w-4xl flex-col gap-6">
        {ESTADOS.map(({ estado, legenda }) => (
          <section
            key={estado}
            data-preview-estado={estado}
            className="flex flex-col gap-2"
          >
            <h2 className="text-rotulo uppercase text-ink-3">{legenda}</h2>
            <WhatsAppBanner
              clientId="00000000-0000-0000-0000-000000000000"
              estadoForcado={estado}
            />
          </section>
        ))}
      </div>

      {/* Desconectar e trocar de número (03/10/2026): o bloco que mora na tela
          do Agente, com o WhatsApp aberto (ações) e caído (só o caminho de volta). */}
      <h2 className="mb-1 mt-10 text-titulo">Conexão na tela do Agente</h2>
      <div className="flex max-w-xl flex-col gap-6">
        {(["open", "close"] as const).map((estado) => (
          <section
            key={estado}
            data-preview-conexao={estado}
            className="flex flex-col gap-2"
          >
            <h3 className="text-rotulo uppercase text-ink-3">{estado}</h3>
            <ConexaoCampo
              clientId="00000000-0000-0000-0000-000000000000"
              temInstancia
              estadoForcado={estado}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
