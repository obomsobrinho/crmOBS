"use client";

import { useEffect, useState } from "react";
import { Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { diaIsoSP, diaMes } from "@/lib/fuso";
import { DAY_LABEL } from "@/lib/agent-prompt";
import { chaveDoDia, faixaHoraria } from "@/lib/agenda";
import { agoraMs } from "@/lib/periodo";
import { CabecalhoBloco } from "./ContactFields";

// HISTÓRICO DE AGENDAMENTOS NA FICHA (decisão do dono, 28/10/2026): os
// horários do contato, futuros, passados e cancelados, em ordem de tempo (o
// mais recente em cima). Lê só deste contato (`client_id` + `phone`, índice
// `agendamentos_do_tenant`), de 10 em 10. Sem agenda (ou sem a migration) e sem
// nenhum horário, o bloco não aparece.

export interface AgendamentoDoContato {
  id: number;
  servicoNome: string;
  inicio: number;
  fim: number;
  status: "confirmado" | "cancelado";
  origem: "ia" | "time";
  /** O contato confirmou presença depois do lembrete. */
  confirmado?: boolean;
}

const PAGINA = 10;

async function lerPagina(clientId: string, phone: string, depois: AgendamentoDoContato | null): Promise<AgendamentoDoContato[] | null> {
  let q = createClient()
    .from("agendamentos")
    .select("id, servico_nome, inicio, fim, status, origem, confirmado_em")
    .eq("client_id", clientId)
    .eq("phone", phone)
    .order("inicio", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGINA);
  if (depois) {
    const iso = new Date(depois.inicio).toISOString();
    q = q.or(`inicio.lt.${iso},and(inicio.eq.${iso},id.lt.${depois.id})`);
  }
  const { data, error } = await q;
  if (error) return null;
  return (data ?? []).map((a) => ({
    id: a.id,
    servicoNome: a.servico_nome,
    inicio: Date.parse(a.inicio),
    fim: Date.parse(a.fim),
    status: a.status === "cancelado" ? "cancelado" : "confirmado",
    origem: a.origem === "time" ? "time" : "ia",
    confirmado: !!a.confirmado_em,
  }));
}

function quando(a: AgendamentoDoContato): string {
  const dia = diaIsoSP(a.inicio);
  const nome = DAY_LABEL[chaveDoDia(dia)];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${diaMes(dia)}/${dia.slice(0, 4)}, ${faixaHoraria(a.inicio, a.fim)}`;
}

export default function ContactAgendamentos({
  clientId,
  phone,
  preview,
}: {
  clientId: string;
  phone: string;
  /** Só o preview `/design`: os horários, que sem banco não existem. */
  preview?: AgendamentoDoContato[];
}) {
  const [itens, setItens] = useState<AgendamentoDoContato[]>(preview ?? []);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (preview) return;
    let vivo = true;
    lerPagina(clientId, phone, null).then((l) => {
      if (!vivo || !l) return;
      setItens(l);
      setTemMais(l.length === PAGINA);
    });
    return () => {
      vivo = false;
    };
  }, [clientId, phone, preview]);

  if (itens.length === 0) return null;
  const agora = agoraMs();
  return (
    <div data-slot="painel-agendamentos" className="flex flex-col gap-2.5 px-4 pt-4">
      <CabecalhoBloco rotulo="Horários marcados" />
      <ul className="flex flex-col gap-2">
        {itens.map((a) => {
          const passou = a.status === "confirmado" && a.fim <= agora;
          return (
            <li key={a.id} data-slot="agendamento-do-contato" data-situacao={a.status} className="rounded-lg border border-line-soft bg-bloco px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className={a.status === "cancelado" ? "text-apoio text-ink-3 line-through" : "text-apoio font-medium"}>
                  {a.servicoNome}
                </span>
                {a.status === "cancelado" ? (
                  <Badge variant="estado-neutro">Cancelado</Badge>
                ) : passou ? (
                  <Badge variant="estado-neutro">Realizado</Badge>
                ) : (
                  <Badge variant="estado-bom">{a.confirmado ? "Confirmado" : "Marcado"}</Badge>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-legenda tabular-nums text-ink-3">
                {a.origem === "ia" ? <Sparkles size={11} /> : <UserRound size={11} />}
                {quando(a)}
              </p>
            </li>
          );
        })}
      </ul>
      {temMais && !preview && (
        <Button
          variant="link"
          size="link"
          carregando={carregando}
          onClick={async () => {
            setCarregando(true);
            const mais = await lerPagina(clientId, phone, itens[itens.length - 1]);
            setCarregando(false);
            if (!mais) return;
            setItens((cur) => [...cur, ...mais.filter((m) => !cur.some((c) => c.id === m.id))]);
            setTemMais(mais.length === PAGINA);
          }}
        >
          Ver mais antigos
        </Button>
      )}
    </div>
  );
}
