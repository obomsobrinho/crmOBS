import GuardaDaTela from "@/components/GuardaDaTela";
import TelaDaAgenda from "@/features/agenda/components/TelaDaAgenda";

export const dynamic = "force-dynamic";

// AGENDA PRÓPRIA (28/10/2026, docs/plano-agenda.md). Agenda desligada: a página não
// existe para o tenant (vai para as configurações, se dono, ou para as conversas). Sem
// a migration aplicada as tabelas não existem: a tela diz que a agenda não está
// disponível.
//
// Área migrada no passo 3b de docs/plano-dados-e-estado.md (15/11/2026): a página NÃO
// lê o banco (D8). A sessão vem do layout do `(app)`, e a abertura (configuração,
// serviços, horários e a semana) é lida no navegador pelo cache (`TelaDaAgenda`).
//
// ⚠️ Sem `ativa` na guarda: conta bloqueada vê a agenda em leitura, como o `/inbox`;
// as rotas de escrita respondem 402.
export default function AgendaPage() {
  return (
    <GuardaDaTela>
      <TelaDaAgenda />
    </GuardaDaTela>
  );
}
