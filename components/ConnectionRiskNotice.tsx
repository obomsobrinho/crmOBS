"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Transparência sobre a conexão, na tela onde a decisão é tomada.
//
// REGRAS DE CONTEÚDO (decisão de estratégia, não mexer sem falar com o dono do
// produto): não prometer proteção contra bloqueio (ninguém consegue desbloquear
// um número de terceiro) e não usar "não pague a API da Meta" como argumento,
// porque os Termos da Meta tratam alegação pública de marketing como evidência
// de uso indevido. O texto fala de risco e de plano B, não de blindagem.
//
// ⚠️ DUAS RODADAS DE CORTE NO MESMO DIA (24/09/2026, pedidos do dono). Primeiro
// "muito texto, muito texto mesmo", depois "esse alarme grande de bloqueio não é
// uma boa impressão logo de cara". Ficou uma LINHA, sem cartão e sem ícone de
// alerta, com o conselho que muda a decisão (número dedicado). O risco de
// bloqueio NÃO sumiu: está a um toque, com a mesma honestidade de antes (não
// temos como impedir nem reverter). Esconder de vez violaria a regra acima.
export default function ConnectionRiskNotice() {
  const [aberto, setAberto] = useState(false);

  return (
    <div data-slot="aviso-risco" className="w-full max-w-md space-y-2 px-1 text-apoio text-ink-3">
      <p>
        Use um número dedicado ao atendimento, nunca o seu pessoal.{" "}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="inline-flex items-center gap-0.5 font-medium text-ink-2 underline-offset-2 hover:underline"
        >
          Entenda os riscos
          {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </p>

      {aberto && (
        <div className="space-y-2 text-ink-2">
          <p>
            Existe risco de bloqueio: o WhatsApp pode restringir números que
            considere fora das regras, e não temos como impedir o bloqueio nem
            como reverter. Não é a API Oficial da Meta: a conexão usa Aparelhos
            conectados, o mesmo recurso do WhatsApp Web.
          </p>
          <p>
            O que aumenta o risco: mensagem para quem não procurou você, disparo
            em massa, chip novo com muito volume e muita gente marcando como
            spam. O sistema foi feito para o contrário, responder quem chamou
            você.
          </p>
          <p>
            Se o número cair, nada se perde aqui: conversas e configuração ficam
            no sistema. Você conecta outro número nesta mesma tela e avisa seus
            clientes. Se preferir sair desse tipo de conexão, existe a API
            Oficial da Meta, mais estável e com custo por mensagem (a partir de
            01/10/2026 ela cobra também as de atendimento).
          </p>
        </div>
      )}
    </div>
  );
}
