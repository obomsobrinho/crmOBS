"use client";

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import Playground, {
  type ConfiguracaoEmEdicao,
  type PlaygroundTurn,
} from "./Playground";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";

// Bancada de teste dentro do `/agente`, em painel lateral.
//
// POR QUE ELA MUDOU DE LUGAR: configurar e testar o agente são a mesma
// atividade, e estavam em duas telas. O ciclo real é editar, testar, voltar,
// editar. Com a bancada em tela própria, testar exigia SALVAR antes, e salvar já
// é publicar (o n8n lê `clients.persona` ao vivo): ou seja, para testar, o dono
// mexia no agente que está atendendo cliente de verdade. A causa era só a
// separação das telas.
//
// POR QUE PAINEL E NÃO DUAS COLUNAS: o layout do `/agente` foi aprovado em
// 22/08/2026 (chave de ligar no cabeçalho, horário como seção, Salvar no rodapé,
// prompt gerado em painel). Fundir em duas colunas refaria essa tela. O painel
// entrega o mesmo ciclo curto sem tocar em nada do que já está aprovado.
//
// NADA É GRAVADO: o `/api/playground` trava `dryRun`, então não entra
// `chat_messages`, o card não anda no funil (só é dito para onde ANDARIA) e a
// linha de medição em `agent_turns` sai marcada `dry_run`.

export default function AgentTestDrawer({
  configuracao,
  stageNames,
  defaultOpen = false,
  initialTurns,
}: {
  /**
   * O que está no formulário AGORA. Passado direto para a bancada, que lê no
   * momento de cada turno: alterar um campo e mandar a próxima mensagem já testa
   * o valor novo, sem salvar e sem reabrir o painel.
   */
  configuracao: ConfiguracaoEmEdicao;
  /** key -> nome do estágio, para rotular o "estágio que moveria". */
  stageNames: Record<string, string>;
  /** Só para o /design: abre o painel já aberto, com conversa de exemplo. */
  defaultOpen?: boolean;
  initialTurns?: PlaygroundTurn[];
}) {
  const [aberto, setAberto] = useState(defaultOpen);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="outline" size="field">
          <FlaskConical size={15} />
          Testar o agente
        </Button>
      </SheetTrigger>

      <SheetContent tamanho="largo" aria-describedby={undefined}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <SheetTitle>Testar o agente</SheetTitle>
            <SheetDescription className="mt-1">
              Converse como se fosse um cliente. Vale o que está na tela agora,
              mesmo sem salvar, e nada é enviado no WhatsApp.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-control" aria-label="Fechar">
              <X size={16} />
            </Button>
          </SheetClose>
        </div>

        {/* min-h-0 é o que deixa a conversa rolar dentro do painel em vez de
            esticar o painel inteiro. */}
        <div className="flex min-h-0 flex-1 flex-col p-5">
          <Playground
            stageNames={stageNames}
            configuracao={configuracao}
            initialTurns={initialTurns}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
