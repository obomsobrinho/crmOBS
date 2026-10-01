"use client";

import { useCallback, useEffect, useState } from "react";
import Thread from "./Thread";
import type { Handoff } from "./HandoffCard";
import FichaContato from "./FichaContato";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { createClient } from "@/lib/supabase/client";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import { anunciarIa } from "@/lib/ia-bus";
import { useNomeDoContato } from "@/lib/use-nome-contato";
import type { Member } from "@/lib/team";
import type { Qualification } from "@/lib/crm";
import type { Json } from "@/lib/database.types";
import type { ChatRow } from "@/lib/types";

// Compõe a thread + o painel de contexto. Dono do estado da IA
// (atendimento_ia) para que header e painel fiquem sempre sincronizados —
// um único realtime + toggle otimista, compartilhado pelos dois.
export default function ConversationView({
  phone,
  name,
  nomeBase = null,
  fotoPath = null,
  atendimentoIa,
  initialRows,
  temAntigas = false,
  firstMessageAt,
  messageCount,
  assignedUserId,
  members,
  myUserId,
  conversationId,
  pendingInstruction,
  clientId,
  displayName,
  customFields,
  contactEmail = null,
  contactBirthDate = null,
  contactExists,
  readOnly,
  qualificacaoPreview,
  handoffAtInicial,
  handoffsPreview,
}: {
  phone: string;
  name: string | null;
  /** O nome SEM o apelido (pushName ou melhor nome das mensagens): vale quando o apelido é apagado (R-15). */
  nomeBase?: string | null;
  /** Foto de perfil guardada (lib/fotos.ts). */
  fotoPath?: string | null;
  atendimentoIa: string | null;
  initialRows: ChatRow[];
  /** Há mensagens mais antigas que as que vieram (a conversa é paginada). */
  temAntigas?: boolean;
  firstMessageAt: string | null;
  messageCount: number;
  assignedUserId: string | null;
  members: Member[];
  myUserId: string;
  conversationId: number | null;
  pendingInstruction: string | null;
  clientId: string;
  displayName: string | null;
  customFields: Json | null;
  contactEmail?: string | null;
  contactBirthDate?: string | null;
  contactExists: boolean;
  /** Conta bloqueada por assinatura: a conversa é visível, mas não se trabalha. */
  readOnly?: boolean;
  /** Só o preview /design: injeta o entendimento, que sem banco não existe. */
  qualificacaoPreview?: Qualification;
  /** `conversations.handoff_at` já lido pelo servidor (R-14): poupa a consulta da faixa. */
  handoffAtInicial?: string | null;
  /** Só o preview /design: os pedidos de ajuda da IA. */
  handoffsPreview?: Handoff[];
}) {
  const supabase = createClient();
  // Renomear o contato (aba "Dados") corrige o cabeçalho na hora, sem refresh (R-15).
  const nomeExibido = useNomeDoContato(phone, name, nomeBase);
  const [showContext, setShowContext] = useState(true);
  // Celular: o painel do contato não cabe ao lado da conversa e vira folha de
  // baixo, aberta pelos três pontos do cabeçalho (plano do mobile, fase 1).
  const [contatoFolha, setContatoFolha] = useState(false);
  const [iaState, setIaState] = useState<string | null>(atendimentoIa);
  const [iaProp, setIaProp] = useState<string | null>(atendimentoIa);
  const [assigned, setAssigned] = useState<string | null>(assignedUserId);
  const [assignedProp, setAssignedProp] = useState<string | null>(assignedUserId);
  const [instruction, setInstruction] = useState<string | null>(pendingInstruction);
  const [instructionProp, setInstructionProp] = useState<string | null>(
    pendingInstruction
  );

  // Ajuste em tempo de render (sem efeito) quando o estado da IA, a atribuição
  // ou a orientação vindas do servidor mudam ao trocar de conversa. Ver
  // react.dev "adjusting state when a prop changes".
  //
  // O da IA era um `useEffect` com `setState` dentro, o que gera renderização em
  // cascata: React pinta com o valor antigo, o efeito roda, e ele pinta de novo.
  // Aqui o ajuste acontece ANTES da primeira pintura, então a chave nunca
  // aparece na posição da conversa anterior.
  if (iaProp !== atendimentoIa) {
    setIaProp(atendimentoIa);
    setIaState(atendimentoIa);
  }
  if (assignedProp !== assignedUserId) {
    setAssignedProp(assignedUserId);
    setAssigned(assignedUserId);
  }
  if (instructionProp !== pendingInstruction) {
    setInstructionProp(pendingInstruction);
    setInstruction(pendingInstruction);
  }

  // Assumir / transferir / soltar a conversa. A RLS libera UPDATE de
  // conversations ao tenant, então filtrar por telefone atinge só a linha dele.
  //
  // ⚠️ ATRIBUIR PAUSA A IA (decisão do dono, 19/09/2026). A invariante "IA e
  // pessoa nunca atendem a mesma conversa" já era a regra de EXIBIÇÃO
  // (`quemAtende`, lib/crm.ts) e já valia no envio manual (`POST /api/send`
  // pausa a IA ao responder). O que faltava era ela valer no BANCO quando o
  // gesto é atribuir: dava para ter a conversa de alguém com a IA ligada, e a
  // tela mostrava as duas coisas ao mesmo tempo.
  //
  // Vale também ao atribuir a um COLEGA, e não só a si mesmo: é o mesmo gesto,
  // a conversa passou a ser de uma pessoa.
  //
  // ⚠️ SOLTAR (userId nulo) NÃO RELIGA A IA, de propósito: soltar sem religar é
  // um estado legítimo ("ninguém atende"), e é justamente o estado que o produto
  // já mostra como dívida visível na lista. Quem religa é a chave.
  const assign = useCallback(
    async (userId: string | null) => {
      const prev = assigned;
      setAssigned(userId); // otimista
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_user_id: userId })
        .eq("phone", phone);
      if (error) {
        setAssigned(prev); // reverte
        return;
      }
      if (userId == null || iaState === "pause") return;
      const prevIa = iaState;
      setIaState("pause"); // otimista
      anunciarIa({ phone, estado: "pause" });
      const { error: iaErr } = await supabase
        .from("dados_cliente")
        .update({ atendimento_ia: "pause" })
        .eq("telefone", phone);
      if (iaErr) {
        setIaState(prevIa); // reverte
        anunciarIa({ phone, estado: prevIa });
      }
    },
    [assigned, iaState, phone, supabase]
  );

  // Abrir a conversa marca como lida (zera o contador). A RLS restringe o update
  // ao tenant do usuário, então filtrar por telefone atinge só a linha dele.
  //
  // ⚠️ O `await` NÃO é decoração: o query builder do Supabase é LAZY e só manda a
  // requisição quando alguém chama `.then()`. Isto era `void supabase...`, que
  // descarta o valor sem acionar o builder, então o PATCH jamais saía e o
  // contador de não lidas ficava aceso para sempre. Provado por rede: abrir a
  // conversa não gerava PATCH nenhum. Com Promise de verdade `void` funciona,
  // porque ela já está em execução; com builder preguiçoso, não. Os outros
  // `void supabase.removeChannel(...)` do projeto seguem corretos, porque
  // `removeChannel` devolve Promise, e não builder.
  useEffect(() => {
    void (async () => {
      await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("phone", phone)
        .gt("unread_count", 0);
    })();
  }, [phone, supabase]);

  // Realtime desta conversa (outro atendente pode assumir; a IA pode ser ligada
  // ou desligada em outra aba). Canal do tenant, compartilhado com o resto da
  // tela (02/10/2026, R-03/R-22): só importa a linha deste telefone, e o evento
  // encaixa o valor no estado sem consulta. Reconectou ou voltou o foco: busca
  // as duas colunas desta linha, porque a chave da IA e o responsável decidem
  // quem responde e não podem ficar velhos depois de uma queda.
  const revalidarLinha = useCallback(async () => {
    const [{ data: conv }, { data: cli }] = await Promise.all([
      supabase
        .from("conversations")
        .select("assigned_user_id")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .maybeSingle(),
      supabase
        .from("dados_cliente")
        .select("atendimento_ia")
        .eq("client_id", clientId)
        .eq("telefone", phone)
        .maybeSingle(),
    ]);
    if (conv) setAssigned((conv.assigned_user_id as string | null) ?? null);
    if (cli) setIaState((cli.atendimento_ia as string | null) ?? null);
  }, [supabase, clientId, phone]);

  useCanalTenant({
    clientId,
    tabelas: ["conversations", "dados_cliente"],
    modo: "aplicar",
    revalidar: () => void revalidarLinha(),
    aoEvento: (ev) => {
      if (foneDoEvento(ev) !== phone || !ev.novo || ev.tipo === "DELETE") return;
      if (ev.tabela === "conversations" && "assigned_user_id" in ev.novo) {
        setAssigned((ev.novo.assigned_user_id as string | null) ?? null);
      } else if (ev.tabela === "dados_cliente" && "atendimento_ia" in ev.novo) {
        setIaState((ev.novo.atendimento_ia as string | null) ?? null);
      }
    },
  });

  // Nota interna e orientação da IA vêm das abas da caixa de escrita. Estavam
  // as duas na coluna da direita, cada uma com a sua própria caixa de texto,
  // então havia três lugares para escrever na mesma tela.
  const addNote = useCallback(
    async (body: string) => {
      if (conversationId == null) return;
      await supabase.from("conversation_notes").insert({
        client_id: clientId,
        conversation_id: conversationId,
        author_user_id: myUserId,
        body,
      });
    },
    [supabase, clientId, conversationId, myUserId]
  );

  // ORIENTAR UM PEDIDO DE AJUDA (o cartão na conversa, 27/09/2026): resolve o
  // pedido e a IA responde NA HORA (`POST /api/conversations/orientar`, que
  // também religa a IA e larga o responsável). Se ela não conseguir responder
  // agora, a orientação fica pendente e aparece colada na caixa de escrita.
  const orientarPedido = useCallback(
    async (text: string, pedidoId?: number) => {
      const res = await fetch("/api/conversations/orientar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, instruction: text, pedidoId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { enviado?: boolean };
      setIaState("ativa");
      setAssigned(null);
      if (!data.enviado) setInstruction(text);
    },
    [phone]
  );

  // Orienta a IA e reativa: ela consome a orientação na PRÓXIMA mensagem do
  // cliente (consumo único em /api/agent) e segue sozinha.
  const instruct = useCallback(
    async (text: string) => {
      // A orientação entra no prompt como texto confiável do time, então o
      // browser não escreve mais a coluna: vai pela rota, que confere sessão,
      // tenant e tamanho (R-40, 01/10/2026).
      const gravou = await fetch("/api/conversations/instrucao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, instruction: text }),
      }).catch(() => null);
      if (!gravou?.ok) return;
      await supabase
        .from("dados_cliente")
        .update({ atendimento_ia: "reativada" })
        .eq("telefone", phone);
      setInstruction(text);
      setIaState("reativada");
      // ⚠️ Orientar TAMBÉM religa a IA, então limpa o responsável junto (mesma
      // decisão de 19/09/2026). Este é o terceiro caminho que devolve a conversa
      // à IA, além da chave e do botão Resolvido, e deixá-lo de fora reporia o
      // estado contraditório pela porta dos fundos.
      if (assigned == null) return;
      const prevAssigned = assigned;
      setAssigned(null); // otimista
      const { error: assignErr } = await supabase
        .from("conversations")
        .update({ assigned_user_id: null })
        .eq("client_id", clientId)
        .eq("phone", phone);
      if (assignErr) setAssigned(prevAssigned); // reverte
    },
    [supabase, clientId, phone, assigned]
  );

  const cancelInstruction = useCallback(async () => {
    const prev = instruction;
    setInstruction(null); // otimista
    const cancelou = await fetch("/api/conversations/instrucao", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }).catch(() => null);
    if (!cancelou?.ok) setInstruction(prev); // reverte
  }, [phone, instruction]);

  const toggleIa = useCallback(async () => {
    // Conta bloqueada não liga nem desliga a IA. A guarda fica aqui (e não só no
    // botão) porque o mesmo callback é usado pelo header e pelo painel lateral.
    if (readOnly) return;
    const pausada = iaState === "pause";
    const next = pausada ? "ativa" : "pause";
    const prev = iaState;
    setIaState(next); // otimista
    // A lista de conversas mostra QUEM está atendendo no canto do avatar, e ela é
    // outro componente. Sem este aviso ela só descobre pelo realtime (ida ao
    // Postgres, volta do WebSocket e três consultas), então a marca ficava
    // atrasada em relação à chave que a pessoa acabou de virar.
    anunciarIa({ phone, estado: next });
    const { error } = await supabase
      .from("dados_cliente")
      .update({ atendimento_ia: next })
      .eq("telefone", phone);
    if (error) {
      setIaState(prev); // reverte em caso de falha
      anunciarIa({ phone, estado: prev });
      return;
    }
    // ⚠️ RELIGAR A IA LIMPA O RESPONSÁVEL (a outra metade da decisão de
    // 19/09/2026). Sem isto, a conversa voltaria para a IA continuando marcada
    // como de uma pessoa, que é o estado contraditório que este ajuste existe
    // para acabar. Desligar a IA NÃO atribui ninguém: quem atribui é o menu de
    // quem atende ou responder pelo CRM.
    if (next === "pause" || assigned == null) return;
    const prevAssigned = assigned;
    setAssigned(null); // otimista
    const { error: assignErr } = await supabase
      .from("conversations")
      .update({ assigned_user_id: null })
      .eq("phone", phone);
    if (assignErr) setAssigned(prevAssigned); // reverte
  }, [assigned, iaState, phone, supabase, readOnly]);

  const painelContato = (
    <FichaContato
      superficie="conversa"
      name={nomeExibido}
      nomeBase={nomeBase}
      fotoPath={fotoPath}
      phone={phone}
      firstMessageAt={firstMessageAt}
      messageCount={messageCount}
      members={members}
      myUserId={myUserId}
      conversationId={conversationId}
      // As tags entraram na coluna do cliente (desenho de 18/09/2026), e
      // criar ou aplicar rótulo é escrita por tenant.
      clientId={clientId}
      editableName={displayName}
      customFields={customFields}
      email={contactEmail}
      birthDate={contactBirthDate}
      contactExists={contactExists}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <Sheet open={contatoFolha} onOpenChange={setContatoFolha}>
        <SheetContent
          lado="baixo"
          aria-describedby={undefined}
          // Sem foco automático: no celular focar um campo sobe o teclado por
          // cima da folha que a pessoa só queria LER.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <SheetTitle className="sr-only">Dados do contato</SheetTitle>
          <ScrollArea fade={DISSOLVER_LISTA} className="min-h-0 flex-1">
            {painelContato}
          </ScrollArea>
        </SheetContent>
      </Sheet>
      {/* Conversa e contato dividem o cartão com a lista. Cartão dentro de
          cartão não é hierarquia, é sujeira: o que separa as colunas é uma
          linha de 1px, e só a área de mensagens tem superfície própria. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-msg">
        <Thread
          phone={phone}
          name={nomeExibido}
      fotoPath={fotoPath}
          iaState={iaState}
          onToggleIa={toggleIa}
          initialRows={initialRows}
          temAntigasInicial={temAntigas}
          onToggleContext={() => setShowContext((v) => !v)}
          onOpenContato={() => setContatoFolha(true)}
          contextOpen={showContext}
          clientId={clientId}
          readOnly={readOnly}
          onAddNote={conversationId != null ? addNote : undefined}
          onInstruct={instruct}
          onOrientarPedido={orientarPedido}
          pendingInstruction={instruction}
          onCancelInstruction={cancelInstruction}
          assignedUserId={assigned}
          members={members}
          myUserId={myUserId}
          onAssign={assign}
          conversationId={conversationId}
          qualificacaoPreview={qualificacaoPreview}
          handoffAtInicial={handoffAtInicial}
          handoffsPreview={handoffsPreview}
        />
      </div>
      {showContext && (
        <aside className="hidden w-[296px] shrink-0 border-l border-line bg-raised lg:block">
          <ScrollArea fade={DISSOLVER_LISTA} className="h-full">
            {painelContato}
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
