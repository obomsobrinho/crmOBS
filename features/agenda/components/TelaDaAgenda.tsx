"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";
import { ErroDoBloco } from "@/components/ui/erro-do-bloco";
import { AGENDA_PADRAO, horarioDaAgenda, segundaDaSemana } from "@/lib/agenda";
import { diaIsoSP } from "@/lib/fuso";
import { agoraMs } from "@/lib/periodo";
import { useSessao } from "@/lib/sessao";
import { chavesDaAgenda } from "../api/chaves";
import type { FonteAgenda } from "../api/fonte";
import { aberturaDaAgenda, fonteDaAgendaDoNavegador } from "../api/navegador";
import Agenda from "./Agenda";
import { useSemanaNaUrl } from "./na-url";

/**
 * A Agenda na página de verdade (passo 3b de docs/plano-dados-e-estado.md): a página não
 * lê o banco (D8). A sessão vem do layout, a abertura (configuração, serviços, horários
 * e a semana da URL) é UMA leitura do navegador pelo cache, com a moldura da Agenda
 * enquanto chega. Daí em diante a tela navega e escreve como antes; cada escrita deixa o
 * cache da Agenda velho, para voltar à tela nunca mostrar a semana de antes da escrita.
 *
 * ⚠️ Conta bloqueada vê a agenda em leitura (como o `/inbox`); as rotas de escrita
 * respondem 402. Agenda desligada: vai para as configurações (dono) ou para as conversas.
 */
export default function TelaDaAgenda() {
  const s = useSessao();
  const router = useRouter();
  const qc = useQueryClient();
  const [agora] = useState(agoraMs);
  const semanaDaUrl = useSemanaNaUrl()[0];
  // A semana com que a tela ABRIU (a da URL num refresh, senão a de hoje); navegar entre
  // semanas é com a própria tela, que lê a semana nova pela fonte.
  const [semana] = useState(() => segundaDaSemana(semanaDaUrl ?? diaIsoSP(agora)));
  const q = useQuery({
    queryKey: chavesDaAgenda.abertura(semana),
    queryFn: () => aberturaDaAgenda(s.clientId, s.avisos, semana),
  });
  const desligada = q.data?.agenda && !q.data.agenda.config.ativa;
  useEffect(() => {
    if (desligada) router.replace(s.papel === "dono" ? "/agenda/configuracoes" : "/inbox");
  }, [desligada, router, s.papel]);

  const fonte = useMemo<FonteAgenda>(() => {
    const base = fonteDaAgendaDoNavegador(s.clientId, s.avisos);
    const depois = <T,>(r: Promise<T>) => r.finally(() => void qc.invalidateQueries({ queryKey: chavesDaAgenda.tudo, refetchType: "none" }));
    return {
      ...base,
      marcar: (p) => depois(base.marcar(p)),
      cancelar: (id) => depois(base.cancelar(id)),
      remarcar: (id, inicio) => depois(base.remarcar(id, inicio)),
      bloquear: (p) => depois(base.bloquear(p)),
      desbloquear: (id) => depois(base.desbloquear(id)),
      salvarConfig: (c, sv) => depois(base.salvarConfig(c, sv)),
    };
  }, [s.clientId, s.avisos, qc]);

  if (q.isError && !q.data) {
    return <ErroDoBloco frase="Não deu para abrir a agenda agora." aoTentar={() => void q.refetch()} tentando={q.isFetching} className="m-auto" />;
  }
  if (!q.data || desligada) return <MolduraDeCarregamento titulo="Agenda" controles={2} corpo="semana" />;
  const d = q.data;
  const config = d.agenda?.config ?? AGENDA_PADRAO;
  return (
    <Agenda
      fonte={fonte}
      agora={agora}
      empresa={s.nome}
      dono={s.papel === "dono"}
      disponivel={d.disponivel}
      hours={horarioDaAgenda(config, d.horarioAtendimento)}
      horarioAtendimento={d.horarioAtendimento}
      config={config}
      servicos={d.agenda?.servicos ?? []}
      inicial={{ semana, itens: d.itens, bloqueios: d.bloqueios }}
      hrefConfig="/agenda/configuracoes"
      readOnly={s.access.blocked}
    />
  );
}
