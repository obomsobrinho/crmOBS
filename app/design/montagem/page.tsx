import Link from "next/link";
import MontagemWizard from "@/components/MontagemWizard";
import { EMPTY_CONFIG, type AgentConfig } from "@/lib/agent-prompt";
import { PASSOS_MONTAGEM, type PassoMontagem } from "@/lib/onboarding";
import type { KnowledgeDoc } from "@/lib/crm";

// Preview do ASSISTENTE DE MONTAGEM (dev-only, liberado pelo proxy).
//
// Renderiza o componente de verdade, com `preview` ligado: nada salva, nada
// publica, nada navega, e o rascunho do navegador é ignorado. `?passo=` abre um
// passo direto, que é como o e2e alcança cada um deles sem precisar de sessão.
//
// ⚠️ Importa `MontagemWizard` direto, e não o carregador `MontagemCliente`: sem
// rascunho para ler (`preview`), o pré-render não diverge, e assim o preview
// continua mostrando a tela mesmo antes de o JavaScript carregar.
export const dynamic = "force-dynamic";

// Conta nova de verdade: tudo vazio menos o nome, que vem do cadastro. É o que a
// pessoa vê no primeiro segundo.
const VAZIO: AgentConfig = { ...EMPTY_CONFIG, companyName: "Ótica Vision" };
const SEM_DOCS: KnowledgeDoc[] = [];

function ehPasso(v: string | undefined): v is PassoMontagem {
  return PASSOS_MONTAGEM.some((p) => p.key === v);
}

export default async function DesignMontagemPage({
  searchParams,
}: {
  // Next 16: os parâmetros de busca chegam como Promise.
  searchParams: Promise<{ passo?: string }>;
}) {
  const { passo } = await searchParams;
  const inicial: PassoMontagem = ehPasso(passo) ? passo : "conectar";

  return (
    <div className="bg-canvas">
      <MontagemWizard
        clientId="preview"
        clientName="Ótica Vision"
        // Sem instância: o passo 1 mostra o convite a gerar o código em vez de
        // ficar consultando o status de uma conexão que não existe.
        hasInstance={false}
        initialConfig={VAZIO}
        agentConfigUpdatedAt={null}
        initialNotifyJid={null}
        prefillCompanyName="Ótica Vision"
        knowledgeDocs={SEM_DOCS}
        knowledgeKeyConfigured
        stageNames={{ aguardando_humano: "Aguardando atendimento" }}
        passoDoServidor="conectar"
        passoInicial={inicial}
        preview
      />

      {/* Barra de navegação do PREVIEW, fora do assistente. Não faz parte da
          tela real. */}
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-6 sm:px-6">
        <span className="text-rotulo uppercase text-ink-3">Abrir o passo</span>
        {PASSOS_MONTAGEM.map((p, i) => (
          <Link
            key={p.key}
            href={`/design/montagem?passo=${p.key}`}
            className={`text-legenda ${
              p.key === inicial ? "font-semibold text-brand-ink" : "text-ink-2"
            }`}
          >
            {i + 1}. {p.titulo}
          </Link>
        ))}
      </div>
    </div>
  );
}
