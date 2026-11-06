import type { CSSProperties, ReactNode } from "react";
import {
  BatteryFull,
  BellRing,
  BookOpen,
  CalendarCheck,
  CheckCheck,
  ChevronLeft,
  CircleCheck,
  FileText,
  ReceiptText,
  SignalHigh,
  User,
  UserPlus,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// O painel de marca das telas de entrada (hoje só o login; feito para o /cadastro
// usar igual). O que ele mostra é o trabalho do produto, uma conversa sendo
// atendida, e não um print de tela.
//
// Sem hook, sem estado e sem JavaScript: a animação é só CSS (`.celular-*`,
// `.divisor-*` e `.painel-marca-*` no globals.css). Os tempos moram aqui, em
// `--t`, para o roteiro da conversa, a lista e os cartões serem lidos juntos: o
// que a lista promete acontece na conversa ao lado.

/** Uma linha só com o `--t` de quem entra em `t` segundos. */
function aos(t: number) {
  return { "--t": `${t}s` } as CSSProperties;
}

// ── O divisor: um contorno ondulado em três tons ─────────────────────────────
// Um traçado só, de ponta a ponta da tela, com uma ponta de balão no meio. As
// camadas são o MESMO contorno recuado, e os mesmos dados desenham a borda em pé do
// computador e a deitada da faixa do celular, trocando x por y.

const ESPESSURA = 200;
const COMPRIMENTO = 1000;

/** Sai de cima da tela e passa do fim dela, para o movimento nunca abrir vão. */
const INICIO = [92, -60];
const ONDA = [
  [70, 20, 52, 90, 62, 170],
  [72, 250, 118, 280, 116, 350],
  [114, 410, 76, 430, 72, 486],
  // A ponta do balão.
  [70, 510, 62, 532, 46, 548],
  [66, 552, 82, 546, 94, 530],
  [118, 566, 120, 610, 96, 680],
  [76, 740, 54, 790, 66, 860],
  [76, 920, 104, 980, 92, 1060],
];

const CAMADAS = [
  { classe: "divisor-claro", recuo: 44 },
  { classe: "divisor-medio", recuo: 22 },
  { classe: "divisor-forte", recuo: 0 },
];

function caminhoDoContorno(recuo: number, deitado: boolean) {
  const p = (x: number, y: number) => (deitado ? `${y} ${x}` : `${x} ${y}`);
  const fim = ESPESSURA + 40;
  const curvas = ONDA.map(
    ([x1, y1, x2, y2, x, y]) =>
      `C${p(x1 - recuo, y1)} ${p(x2 - recuo, y2)} ${p(x - recuo, y)}`,
  );
  const [x0, y0] = INICIO;
  return `M${p(fim, y0)}L${p(x0 - recuo, y0)}${curvas.join("")}L${p(fim, COMPRIMENTO + 60)}Z`;
}

/** As três camadas, em pé (computador) ou deitadas (faixa do celular). */
function Divisor({ deitado = false }: { deitado?: boolean }) {
  const idDoTom = deitado ? "divisor-tom-deitado" : "divisor-tom";
  return (
    <div className={deitado ? "divisor divisor-deitado" : "divisor"} aria-hidden>
      {CAMADAS.map(({ classe, recuo }) => (
        <svg
          key={classe}
          className={classe}
          viewBox={deitado ? `0 0 ${COMPRIMENTO} ${ESPESSURA}` : `0 0 ${ESPESSURA} ${COMPRIMENTO}`}
          preserveAspectRatio="none"
        >
          {classe === "divisor-forte" && (
            <defs>
              {/* Deitada, ela encosta na faixa, que usa este mesmo degradê na
                  horizontal: assim não sobra emenda em largura nenhuma. Em pé,
                  a emenda some pela máscara do globals.css. */}
              <linearGradient
                id={idDoTom}
                gradientUnits={deitado ? "userSpaceOnUse" : "objectBoundingBox"}
                x1="0"
                y1="0"
                x2={deitado ? COMPRIMENTO : "0"}
                y2={deitado ? "0" : "1"}
              >
                <stop offset="0" stopColor="var(--brand-grad-start)" />
                <stop offset={deitado ? "0.58" : "1"} stopColor="var(--brand-grad-mid)" />
                {deitado && <stop offset="1" stopColor="var(--brand-grad-end)" />}
              </linearGradient>
            </defs>
          )}
          <path
            d={caminhoDoContorno(recuo, deitado)}
            fill={classe === "divisor-forte" ? `url(#${idDoTom})` : undefined}
          />
        </svg>
      ))}
    </div>
  );
}

// ── A lista do painel ───────────────────────────────────────────────────────

const BENEFICIOS: { texto: string; icone: LucideIcon; t: number; naFaixa?: boolean }[] = [
  { texto: "Responde na hora", icone: Zap, t: 2.8, naFaixa: true },
  { texto: "Usa as informações do seu negócio", icone: BookOpen, t: 3.4 },
  { texto: "Passa orçamento com os seus preços", icone: ReceiptText, t: 4 },
  { texto: "Marca horário na sua agenda", icone: CalendarCheck, t: 5.9, naFaixa: true },
  { texto: "Chama você quando precisa", icone: BellRing, t: 6.8, naFaixa: true },
];

// ── O celular ───────────────────────────────────────────────────────────────

/** Balão da conversa. `t` é quando ele entra, em segundos. */
function BalaoDaConversa({
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
    <div className={cn("celular-balao", `celular-balao-${lado}`)} style={aos(t)}>
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
    <div className="celular-digitando" style={{ ...aos(t), "--dura": `${dura}s` } as CSSProperties}>
      <span />
      <span />
      <span />
    </div>
  );
}

/** Cartão de vidro em volta do aparelho: a posição é de cada um, no globals.css. */
function CartaoDeVidro({
  posicao,
  icone: Icone,
  t,
  children,
}: {
  posicao: string;
  icone: LucideIcon;
  t: number;
  children: ReactNode;
}) {
  return (
    <div className={cn("celular-cartao", posicao)} data-slot="celular-cartao" style={aos(t)}>
      <span className="celular-cartao-icone">
        <Icone />
      </span>
      {children}
    </div>
  );
}

function CelularConversa() {
  return (
    // Ilustração: a frase e a lista do painel já dizem o que ela mostra, e um
    // leitor de tela não deve parar numa conversa de exemplo.
    <div className="celular" data-slot="celular-conversa" aria-hidden>
      <div className="celular-aneis" />
      <div className="celular-corpo">
        <span className="celular-botao celular-botao-acao" />
        <span className="celular-botao celular-botao-volume-1" />
        <span className="celular-botao celular-botao-volume-2" />
        <span className="celular-botao celular-botao-ligar" />
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
            <BalaoDaConversa lado="recebida" hora="22:14" t={0.6}>
              Boa noite! Vocês têm horário amanhã?
            </BalaoDaConversa>
            <div className="celular-vaga">
              <Digitando t={1.3} dura={1.4} />
              <BalaoDaConversa lado="enviada" hora="22:14" t={2.6}>
                Boa noite! Tenho às 9h ou às 14h. Qual fica melhor?
              </BalaoDaConversa>
            </div>
            <BalaoDaConversa lado="recebida" hora="22:15" t={4}>
              Às 14h.
            </BalaoDaConversa>
            <div className="celular-vaga">
              <Digitando t={4.6} dura={1.2} />
              <BalaoDaConversa lado="enviada" hora="22:15" t={5.7}>
                Pronto, marcado para amanhã às 14h.
              </BalaoDaConversa>
            </div>
          </div>
          <div className="celular-reflexo" />
        </div>
      </div>
      <CartaoDeVidro posicao="celular-cartao-novo" icone={UserPlus} t={0.9}>
        Novo cliente
      </CartaoDeVidro>
      <CartaoDeVidro posicao="celular-cartao-orcamento" icone={FileText} t={3.2}>
        Orçamento enviado
      </CartaoDeVidro>
      <CartaoDeVidro posicao="celular-cartao-horario" icone={CalendarCheck} t={6.2}>
        Horário marcado na agenda
      </CartaoDeVidro>
      <CartaoDeVidro posicao="celular-cartao-resolvido" icone={CircleCheck} t={7}>
        Pedido resolvido
      </CartaoDeVidro>
    </div>
  );
}

export default function PainelMarca({ className }: { className?: string }) {
  return (
    <aside data-slot="painel-marca" className={cn("painel-marca", className)}>
      <Divisor />
      <Divisor deitado />
      <div className="painel-marca-recorte brand-grad-painel">
        <div className="painel-marca-texto">
          <h2>A central inteligente do seu WhatsApp.</h2>
          <p>Atende, qualifica e organiza cada cliente até a venda.</p>
        </div>
        <div className="painel-marca-corpo">
          <ul className="painel-marca-lista" data-slot="painel-marca-lista">
            {BENEFICIOS.map(({ texto, icone: Icone, t, naFaixa }) => (
              <li key={texto} style={aos(t)} data-faixa={naFaixa ? "" : undefined}>
                <span className="painel-marca-lista-icone" aria-hidden>
                  <Icone />
                </span>
                {texto}
              </li>
            ))}
          </ul>
          <CelularConversa />
        </div>
      </div>
    </aside>
  );
}
