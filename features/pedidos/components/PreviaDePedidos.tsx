"use client";

import { useState } from "react";
import { ProvedorDeDados } from "@/lib/query/provedor";
import type { Member } from "@/lib/team";
import type { ContatoLinha, PedidoLinha, PedidoResolvidoLinha } from "../regras";
import type { LinhaHistoria } from "../historia";
import { fonteDaMemoria, type FontePedidos } from "../api/fonte";
import Pedidos from "./Pedidos";

// O /design de Pedidos: a mesma tela, com a fonte de memória e um cliente de dados
// próprio. Mora fora de `Pedidos.tsx` para a memória não entrar no JS da página de
// verdade (B8).

/** O que o /design desenha: as linhas falsas de onde a fonte de memória tira os pedidos. */
interface DadosDoPreview {
  abertos: PedidoLinha[];
  resolvidos: PedidoResolvidoLinha[];
  contatos: ContatoLinha[];
  /** Linhas falsas de `chat_messages` por telefone (a história de cada pedido). */
  mensagens?: Record<string, LinhaHistoria[]>;
  /** Pedidos cuja orientação já virou regra (id -> quando). */
  regrasSalvas?: Record<number, string>;
  /** A equipe falsa, para "por quem". */
  membros?: Member[];
}

/** A fonte do /design: a memória, viva durante a visita (o "Resolvido" do preview tira o pedido de verdade). */
function useFonteDoPreview(dados: DadosDoPreview, numeroAvisos: string | null): FontePedidos {
  const [fonte] = useState(() =>
    fonteDaMemoria(
      dados.abertos,
      dados.resolvidos,
      dados.contatos,
      numeroAvisos,
      dados.mensagens ?? {},
      dados.regrasSalvas ?? {},
      dados.membros ?? []
    )
  );
  return fonte;
}

function Tela({ dados, dono }: { dados: DadosDoPreview; dono: boolean }) {
  const fonte = useFonteDoPreview(dados, null);
  return <Pedidos fonte={fonte} numeroAvisos={null} dono={dono} preview />;
}

export default function PreviaDePedidos({ dados, dono, identidade }: { dados: DadosDoPreview; dono: boolean; identidade: string }) {
  return (
    <ProvedorDeDados identidade={identidade}>
      <Tela dados={dados} dono={dono} />
    </ProvedorDeDados>
  );
}
