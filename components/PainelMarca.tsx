import type { CSSProperties, ReactNode } from "react";
import { BatteryFull, Check, CheckCheck, ChevronLeft, SignalHigh, User, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

// O painel de marca das telas de entrada (hoje só o login; feito para o /cadastro
// usar igual). O que ele mostra é o trabalho do produto, uma conversa sendo
// atendida, e não um print de tela.
//
// Sem hook, sem estado e sem JavaScript: a animação é só CSS (`.celular-*` no
// globals.css), corre uma vez e para na conversa completa. Por isso não atrasa
// o login nem disputa foco com o formulário. Os tempos moram aqui, em `--t`, para
// o roteiro da conversa ser lido de uma vez só.

/** Balão da conversa. `t` é quando ele entra, em segundos. */
function Balao({
  lado,
  hora,
  t,
  children,
}: {
  lado: "recebida" | "enviada";
  hora: string;
  t: number;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("celular-balao", `celular-balao-${lado}`)}
      style={{ "--t": `${t}s` } as CSSProperties}
    >
      {children}
      <span className="celular-hora">
        {hora}
        {lado === "enviada" && <CheckCheck />}
      </span>
    </div>
  );
}

/** "Digitando" que ocupa a mesma vaga da resposta, então nada na conversa pula. */
function Digitando({ t, dura }: { t: number; dura: number }) {
  return (
    <div
      className="celular-digitando"
      style={{ "--t": `${t}s`, "--dura": `${dura}s` } as CSSProperties}
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function CelularConversa() {
  return (
    // Ilustração: a frase do painel já diz o que ela mostra, e um leitor de tela
    // não deve parar numa conversa de exemplo.
    <div className="celular" data-slot="celular-conversa" aria-hidden>
      <div className="celular-corpo">
        <div className="celular-tela">
          <div className="celular-status">
            <span>22:14</span>
            <span className="celular-status-icones">
              <SignalHigh />
              <Wifi />
              <BatteryFull />
            </span>
          </div>
          <div className="celular-topo">
            <ChevronLeft />
            <span className="celular-avatar">
              <User />
            </span>
            <span className="celular-contato">
              <strong>Cliente</strong>
              <span>online</span>
            </span>
          </div>
          <div className="celular-mensagens">
            <Balao lado="recebida" hora="22:14" t={0.6}>
              Boa noite! Vocês têm horário amanhã?
            </Balao>
            <div className="celular-vaga">
              <Digitando t={1.3} dura={1.4} />
              <Balao lado="enviada" hora="22:14" t={2.6}>
                Boa noite! Tenho às 9h ou às 14h. Qual fica melhor?
              </Balao>
            </div>
            <Balao lado="recebida" hora="22:15" t={4}>
              Às 14h.
            </Balao>
            <div className="celular-vaga">
              <Digitando t={4.6} dura={1.2} />
              <Balao lado="enviada" hora="22:15" t={5.7}>
                Pronto, marcado para amanhã às 14h.
              </Balao>
            </div>
          </div>
        </div>
      </div>
      <div className="celular-selo" data-slot="celular-selo">
        <span className="celular-selo-check">
          <Check />
        </span>
        Horário marcado na agenda
      </div>
    </div>
  );
}

export default function PainelMarca({ className }: { className?: string }) {
  return (
    <aside data-slot="painel-marca" className={cn("painel-marca", className)}>
      {/* O painel é um balão de conversa gigante: a ponta nasce no canto de cima,
          fora do recorte (que precisa de overflow hidden para cortar o celular). */}
      <svg className="painel-marca-ponta" viewBox="0 0 18 24" aria-hidden>
        <path d="M18 0H3.2C.6 0-.7 3.1 1.2 5L18 22Z" />
      </svg>
      <div className="painel-marca-recorte brand-grad-painel">
        <div className="painel-marca-texto">
          <h2>A central inteligente do seu WhatsApp.</h2>
          <p>Atende, qualifica e organiza cada cliente até a venda.</p>
        </div>
        <div className="painel-marca-palco">
          <CelularConversa />
        </div>
      </div>
    </aside>
  );
}
