"use client";

import { useState } from "react";
import { FlaskConical, RotateCcw, X } from "lucide-react";
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
  aberto: abertoExterno,
  onAbertoChange,
  gatilhoNoCelular = true,
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
  /** Abertura controlada de fora. Sem ela, o painel gerencia o próprio estado. */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  /**
   * `false` no `/agente`: lá, no celular, "Testar" mora nos três pontos do
   * cabeçalho. A montagem mantém o botão, porque não tem esse menu.
   */
  gatilhoNoCelular?: boolean;
}) {
  // Estado interno com escape para CONTROLE externo. Existe porque o modo
  // montagem oferece a bancada uma segunda vez, no rodapé, depois do primeiro
  // save. Renderizar um segundo `AgentTestDrawer` ali daria DOIS `Playground` com
  // conversas diferentes; controlar a abertura de fora mantém uma bancada só.
  const [abertoLocal, setAbertoLocal] = useState(defaultOpen);
  const aberto = abertoExterno ?? abertoLocal;
  const setAberto = (v: boolean) => {
    setAbertoLocal(v);
    onAbertoChange?.(v);
  };
  // Resetar = remontar a bancada. Trocar a `key` devolve turnos, entrada,
  // orientação e estágio simulado ao estado inicial de uma vez, o que evita
  // expor a função de reset do Playground para cá só por causa de um botão.
  const [sessao, setSessao] = useState(0);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="field"
          className={gatilhoNoCelular ? undefined : "max-md:hidden"}
        >
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
          {/* Resetar mora no cabeçalho, junto do fechar: era uma linha própria
              acima da conversa, e aquela linha é que abria um vão grande logo
              embaixo do título. */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="field"
              onClick={() => setSessao((n) => n + 1)}
            >
              <RotateCcw size={14} />
              Resetar
            </Button>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-control" aria-label="Fechar">
                <X size={16} />
              </Button>
            </SheetClose>
          </div>
        </div>

        {/* min-h-0 é o que deixa a conversa rolar dentro do painel em vez de
            esticar o painel inteiro. */}
        <div className="flex min-h-0 flex-1 flex-col p-5">
          <Playground
            key={sessao}
            stageNames={stageNames}
            configuracao={configuracao}
            initialTurns={initialTurns}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
