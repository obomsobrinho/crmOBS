"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import DialogoDaAcao from "@/components/admin/DialogoDaAcao";
import { mostrarAvisoGlobal } from "@/lib/query/aviso-global";
import { ErroDaApi } from "@/lib/query/erro";
import { opcoesDeTirar } from "@/lib/query/escrita";
import { CHAVE_DE_CAMPANHAS } from "./tabela";
import { campanhaAindaEnvia, type SituacaoDaCampanha } from "@/lib/prospeccao";
import { semHistorico, type FonteDeCampanhas, type LeadDaTabela, type RespostaDaEscrita } from "./tipos";

// AS CONFIRMAÇÕES de Campanhas (dono, 04/11/2026): apagar uma campanha, apagar uma lista e tirar um
// lead. Sobre o diálogo da central: a falha aparece dentro dele e o sucesso fecha. Cada uma só monta com
// o item escolhido, para a recusa de um não aparecer no próximo. O texto diz o que acontece com quem já
// recebeu mensagem, porque isso não sai junto
// (docs/adr/2026-11-05-campanhas-delete-triage-and-queue-forecast.md).

const FALHOU = "Não deu para fazer isso agora. Tente de novo.";

/**
 * APAGAR OTIMISTA (passo 2 de docs/plano-dados-e-estado.md; a queixa "apaga um lead,
 * apaga outro e responde Este lead já saiu da lista"): a linha some de toda tabela
 * em cache no clique de confirmar, com o total, e o diálogo fecha na hora. A rota
 * roda depois; recusada, o motivo aparece no aviso do app e a releitura final traz a
 * linha de volta. Só a última escrita pendente relê (lib/query/escrita.ts), então
 * cinco remoções seguidas não se atropelam. "Não encontrado" já é sucesso na fonte.
 */
function useApagar(entidade: "leads" | "buscas" | "campanhas", escrita: (id: string) => Promise<RespostaDaEscrita>) {
  const qc = useQueryClient();
  return useMutation({
    ...opcoesDeTirar<string>({
      qc,
      listas: CHAVE_DE_CAMPANHAS,
      entidade: [CHAVE_DE_CAMPANHAS[0], entidade],
      acao: "apagar",
      executar: async (id) => {
        const r = await escrita(id);
        if (!r.ok) throw new ErroDaApi(409, r.erro);
      },
    }),
    onError: (e) => {
      console.error("campanhas, apagar:", e);
      mostrarAvisoGlobal(e instanceof ErroDaApi ? e.message : FALHOU);
    },
  });
}

/** O que `DialogoDaAcao` espera: null fecha. A linha já saiu; a rota segue sozinha. */
function confirmarOtimista(apagar: (id: string) => void, id: string, depois: () => void): Promise<null> {
  apagar(id);
  depois();
  return Promise.resolve(null);
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
  const apagar = useApagar("campanhas", (id) => fonte.apagarCampanha(id));
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
      onConfirmar={() => confirmarOtimista(apagar.mutate, campanha.id, aoApagar)}
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
  const apagar = useApagar("buscas", (id) => fonte.apagarBusca(id));
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
      onConfirmar={() => confirmarOtimista(apagar.mutate, busca.id, aoApagar)}
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
  const tirar = useApagar("leads", (id) => fonte.removerLead(id, buscaId));
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
      onConfirmar={() => confirmarOtimista(tirar.mutate, lead.id, aoRemover)}
      onFechar={aoFechar}
    />
  );
}
