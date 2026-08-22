"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info, ShieldAlert, Smartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Transparência sobre a conexão por QR code, na tela onde a decisão é tomada.
//
// REGRAS DE CONTEÚDO (decisão de estratégia, não mexer sem falar com o dono do
// produto): não prometer proteção contra bloqueio (ninguém consegue desbloquear
// um número de terceiro) e não usar "não pague a API da Meta" como argumento,
// porque os Termos da Meta tratam alegação pública de marketing como evidência
// de uso indevido. O texto fala de risco e de plano B, não de blindagem.
export default function ConnectionRiskNotice() {
  const [aberto, setAberto] = useState(false);

  return (
    <div className={cn(cardVariants(), "w-full max-w-md space-y-4 p-6")}>
      <div className="flex items-start gap-2">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn-ink" />
        <div>
          <h2 className="text-corpo font-semibold">
            Antes de conectar, leia
          </h2>
          <p className="text-apoio text-ink-2">
            A conexão é feita lendo o QR code em Aparelhos conectados, o mesmo
            recurso que o WhatsApp Web usa. Não é a API Oficial da Meta.
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-bloco p-3">
        <div className="flex items-start gap-2">
          <Smartphone size={15} className="mt-0.5 shrink-0 text-brand-ink" />
          <p className="text-apoio">
            <span className="font-medium">Use um número dedicado ao atendimento.</span>{" "}
            Um chip só para a empresa, nunca o celular pessoal do dono. Se algo
            acontecer com esse número, sua vida pessoal continua funcionando.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info size={15} className="mt-0.5 shrink-0 text-brand-ink" />
          <p className="text-apoio">
            <span className="font-medium">Existe risco de bloqueio.</span> O
            WhatsApp pode restringir um número que ele considere fora das regras
            dele. Isso não depende de nós: não temos como impedir o bloqueio nem
            como reverter um número bloqueado, e ninguém consegue fazer isso.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-rotulo uppercase text-ink-3">
          O que aumenta o risco
        </p>
        <ul className="space-y-1 text-apoio text-ink-2">
          <li>Mandar mensagem para muita gente que não procurou você antes.</li>
          <li>Disparo em massa e campanhas de divulgação.</li>
          <li>Chip novo já começando com volume alto de conversas.</li>
          <li>Muita gente marcando suas mensagens como spam ou bloqueando.</li>
        </ul>
        <p className="mt-2 text-apoio text-ink-2">
          O uso que o sistema foi feito para atender é o contrário disso:
          responder quem chamou você.
        </p>
      </div>

      <button
        onClick={() => setAberto((v) => !v)}
        className={cn(buttonVariants({ variant: "outline", size: "field" }), "w-full justify-between")}
        aria-expanded={aberto}
      >
        Se o número cair, o que acontece
        {aberto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {aberto && (
        <ol className="space-y-2 text-apoio text-ink-2">
          <li>
            <span className="font-medium text-ink">1. Nada se perde aqui.</span>{" "}
            Contatos, conversas, notas e a configuração do agente ficam no
            sistema, não no aparelho. Você continua vendo todo o histórico.
          </li>
          <li>
            <span className="font-medium text-ink">
              2. Você conecta outro número.
            </span>{" "}
            É a mesma tela de agora: escaneia o QR do número novo e o agente
            volta a atender com a configuração que já estava pronta.
          </li>
          <li>
            <span className="font-medium text-ink">
              3. Avise seus clientes do número novo.
            </span>{" "}
            As conversas antigas continuam visíveis, mas as mensagens novas
            chegam no número novo. Essa parte depende de você.
          </li>
          <li>
            <span className="font-medium text-ink">
              4. Se preferir sair do QR,
            </span>{" "}
            existe o caminho da API Oficial da Meta, que é mais estável e tem
            custo por mensagem (e a partir de 01/10/2026 a Meta passa a cobrar
            também as mensagens de atendimento). Vale conversar quando o volume
            justificar.
          </li>
        </ol>
      )}
    </div>
  );
}
