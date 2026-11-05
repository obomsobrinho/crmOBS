"use client";

import DialogoDaAcao from "@/components/admin/DialogoDaAcao";
import { campanhaAindaEnvia, type SituacaoDaCampanha } from "@/lib/prospeccao";
import { semHistorico, type FonteDeCampanhas, type LeadDaTabela, type RespostaDaEscrita } from "./tipos";

// AS CONFIRMAÇÕES de Campanhas (dono, 04/11/2026): apagar uma campanha, apagar uma lista e tirar um
// lead. Sobre o diálogo da central: a falha aparece dentro dele e o sucesso fecha. Cada uma só monta com
// o item escolhido, para a recusa de um não aparecer no próximo. O texto diz o que acontece com quem já
// recebeu mensagem, porque isso não sai junto
// (docs/adr/2026-11-05-campanhas-delete-triage-and-queue-forecast.md).

const FALHOU = "Não deu para fazer isso agora. Tente de novo.";

/** Roda a escrita e devolve o que `DialogoDaAcao` espera: a frase do erro, ou null quando deu certo. */
async function confirmar(escrita: () => Promise<RespostaDaEscrita>, aoApagar: () => void): Promise<string | null> {
  try {
    const r = await escrita();
    if (!r.ok) return r.erro;
    aoApagar();
    return null;
  } catch (e) {
    console.error("campanhas, apagar:", e);
    return FALHOU;
  }
}

export function ApagarCampanha({
  campanha,
  fonte,
  aoFechar,
  aoApagar,
}: {
  /** A campanha a apagar; null = fechado. */
  campanha: { id: string; nome: string; situacao: SituacaoDaCampanha } | null;
  fonte: FonteDeCampanhas;
  aoFechar: () => void;
  aoApagar: () => void;
}) {
  if (!campanha) return null;
  const pode = !campanhaAindaEnvia(campanha.situacao);
  return (
    <DialogoDaAcao
      aberto
      titulo={`Apagar ${campanha.nome || "esta campanha"}?`}
      texto={
        pode ? (
          <>
            <p>A campanha some da lista e quem ainda estava na fila fica livre para outra campanha.</p>
            <p>Quem já recebeu mensagem continua marcado como contatado, nunca recebe duas vezes, e um SAIR continua valendo.</p>
          </>
        ) : (
          <p>Esta campanha ainda pode enviar. Pause antes de apagar.</p>
        )
      }
      rotuloConfirmar="Apagar campanha"
      perigo
      podeConfirmar={pode}
      slot="campanha-apagar-dialogo"
      onConfirmar={() => confirmar(() => fonte.apagarCampanha(campanha.id), aoApagar)}
      onFechar={aoFechar}
    />
  );
}

export function ApagarBusca({
  busca,
  fonte,
  aoFechar,
  aoApagar,
}: {
  /** A lista a apagar; null = fechado. */
  busca: { id: string; termo: string } | null;
  fonte: FonteDeCampanhas;
  aoFechar: () => void;
  aoApagar: () => void;
}) {
  if (!busca) return null;
  return (
    <DialogoDaAcao
      aberto
      titulo={`Apagar a lista ${busca.termo}?`}
      texto={
        <>
          <p>Os leads que só estão nesta lista saem da base.</p>
          <p>Quem já foi contatado ou pediu para parar continua em Todos os leads, para nunca receber de novo.</p>
        </>
      }
      rotuloConfirmar="Apagar lista"
      perigo
      slot="busca-apagar-dialogo"
      onConfirmar={() => confirmar(() => fonte.apagarBusca(busca.id), aoApagar)}
      onFechar={aoFechar}
    />
  );
}

export function RemoverLead({
  lead,
  buscaId,
  fonte,
  aoFechar,
  aoRemover,
}: {
  /** O lead a tirar; null = fechado. */
  lead: LeadDaTabela | null;
  /** A lista de onde ele sai; null = a base inteira (Todos os leads). */
  buscaId: string | null;
  fonte: FonteDeCampanhas;
  aoFechar: () => void;
  aoRemover: () => void;
}) {
  if (!lead) return null;
  const fica = !semHistorico(lead);
  return (
    <DialogoDaAcao
      aberto
      titulo={`Tirar ${lead.nome}${buscaId ? " da lista" : " da base"}?`}
      texto={
        fica ? (
          <p>Ele sai desta lista e de novas campanhas, mas continua em Todos os leads: já foi contatado ou pediu para parar, e a marca impede uma segunda mensagem.</p>
        ) : buscaId ? (
          <p>Ele sai desta lista. Se não estiver em outra lista, sai da base também; uma busca nova pode trazê-lo de volta.</p>
        ) : (
          <p>Ele sai da base e de todas as listas. Uma busca nova pode trazê-lo de volta.</p>
        )
      }
      rotuloConfirmar="Tirar lead"
      perigo
      slot="lead-remover-dialogo"
      onConfirmar={() => confirmar(() => fonte.removerLead(lead.id, buscaId), aoRemover)}
      onFechar={aoFechar}
    />
  );
}
