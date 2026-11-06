import type { CSSProperties, ReactNode } from "react";
import {
  BadgeCheck,
  BatteryFull,
  BellRing,
  BookOpen,
  CalendarCheck,
  CheckCheck,
  ChevronLeft,
  ReceiptText,
  SignalHigh,
  UserPlus,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { DesenhoDoFoguete } from "@/components/Foguete";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import "./painel-marca.css";

// O painel de marca das telas de entrada (hoje só o login; feito para o /cadastro
// usar igual). O que ele mostra é o trabalho do produto, uma conversa sendo
// atendida, e não um print de tela.
//
// Sem hook e sem estado: a animação é só CSS (`painel-marca.css`). Os tempos moram
// aqui, em `--t`, para o roteiro da conversa, a lista e os cartões serem lidos
// juntos: o que a lista promete acontece na conversa ao lado.

/** Uma linha só com o `--t` de quem entra em `t` segundos. */
function aos(t: number) {
  return { "--t": `${t}s` } as CSSProperties;
}

// ── O divisor: um contorno em curvas largas, em três tons ────────────────────
// Um traçado só, de ponta a ponta da tela. As duas camadas de fundo são o mesmo
// contorno recuado e um pouco defasado (é a defasagem que faz a faixa engrossar e
// afinar), e só a da frente leva a ponta de balão. Os mesmos dados desenham a borda
// em pé do computador e a deitada da faixa do celular, trocando x por y.

const ESPESSURA = 200;
const COMPRIMENTO = 1000;

/** Sai de cima da tela e passa do fim dela, para o movimento nunca abrir vão. */
const INICIO = [116, -60];
const SUBIDA = [
  [76, 30, 50, 100, 52, 200],
  [54, 300, 146, 330, 146, 450],
];
const DESCIDA = [
  [146, 610, 54, 620, 54, 760],
  [54, 870, 112, 960, 126, 1060],
];
/** O trecho do meio com a ponta de balão: a curva desce, sai pela ponta e volta. */
const PONTA = [
  [146, 500, 128, 544, 110, 572],
  [96, 590, 84, 604, 66, 612],
  [86, 618, 96, 612, 104, 604],
  [84, 640, 54, 680, 54, 760],
];

const CAMADAS = [
  { classe: "divisor-claro", recuo: 46, defasagem: 34, onda: [...SUBIDA, ...DESCIDA] },
  { classe: "divisor-medio", recuo: 24, defasagem: 16, onda: [...SUBIDA, ...DESCIDA] },
  { classe: "divisor-forte", recuo: 0, defasagem: 0, onda: [...SUBIDA, ...PONTA, DESCIDA[1]] },
];

function caminhoDoContorno(
  { recuo, defasagem, onda }: (typeof CAMADAS)[number],
  deitado: boolean,
) {
  const p = (x: number, y: number) => (deitado ? `${y} ${x}` : `${x} ${y}`);
  const q = (x: number, y: number) => p(x - recuo, y + defasagem);
  const fim = ESPESSURA + 40;
  const curvas = onda.map(([x1, y1, x2, y2, x, y]) => `C${q(x1, y1)} ${q(x2, y2)} ${q(x, y)}`);
  const [x0, y0] = INICIO;
  return `M${p(fim, y0 - 60)}L${q(x0, y0 - 60)}L${q(x0, y0)}${curvas.join("")}L${p(fim, COMPRIMENTO + 120)}Z`;
}

/** As três camadas, em pé (computador) ou deitadas (faixa do celular). */
function Divisor({ deitado = false }: { deitado?: boolean }) {
  const idDoTom = deitado ? "divisor-tom-deitado" : "divisor-tom";
  return (
    <div className={deitado ? "divisor divisor-deitado" : "divisor"} aria-hidden>
      {CAMADAS.map((camada) => (
        <svg
          key={camada.classe}
          className={camada.classe}
          viewBox={deitado ? `0 0 ${COMPRIMENTO} ${ESPESSURA}` : `0 0 ${ESPESSURA} ${COMPRIMENTO}`}
          preserveAspectRatio="none"
        >
          {camada.classe === "divisor-forte" && (
            <defs>
              {/* Deitada, ela encosta na faixa, que usa este mesmo degradê na
                  horizontal: assim não sobra emenda em largura nenhuma. Em pé,
                  a emenda some pela máscara do painel-marca.css. */}
              <linearGradient
                id={idDoTom}
                gradientUnits={deitado ? "userSpaceOnUse" : "objectBoundingBox"}
                x1="0"
                y1="0"
                x2={deitado ? COMPRIMENTO : "0"}
                y2={deitado ? "0" : "1"}
              >
                <stop offset="0" stopColor="var(--brand-grad-start)" />
                <stop offset={deitado ? "0.5" : "0.6"} stopColor="var(--brand-grad-mid)" />
                <stop offset="1" stopColor="var(--painel-fundo)" />
              </linearGradient>
            </defs>
          )}
          <path
            d={caminhoDoContorno(camada, deitado)}
            fill={camada.classe === "divisor-forte" ? `url(#${idDoTom})` : undefined}
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
    <div className={cn("celular-balao", lado === "enviada" && "celular-balao-enviada")} style={aos(t)}>
      {children}
      <span className="celular-hora">
        {hora}
        {lado === "enviada" && <CheckCheck />}
      </span>
    </div>
  );
}

/**
 * A resposta com o "digitando" antes, os dois na mesma vaga, então nada na conversa
 * pula. O "digitando" sai um instante depois de a resposta começar a entrar.
 */
function RespostaDigitada({
  digitaEm,
  hora,
  t,
  children,
}: {
  digitaEm: number;
  hora: string;
  t: number;
  children: ReactNode;
}) {
  const dura = (t + 0.1 - digitaEm).toFixed(1);
  return (
    <div className="celular-vaga">
      <div className="celular-digitando" style={{ ...aos(digitaEm), "--dura": `${dura}s` } as CSSProperties}>
        <span />
        <span />
        <span />
      </div>
      <BalaoDaConversa lado="enviada" hora={hora} t={t}>
        {children}
      </BalaoDaConversa>
    </div>
  );
}

/** Cartão de vidro em volta do aparelho: a posição é de cada um, no painel-marca.css. */
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
              {/* A arte clara sempre: a tela do celular não muda com o tema. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BRAND.markLight} alt="" />
            </span>
            <span className="celular-contato">
              <strong>
                Cliente
                <BadgeCheck className="celular-verificado" />
              </strong>
              <span>online</span>
            </span>
          </div>
          <div className="celular-mensagens">
            <BalaoDaConversa lado="recebida" hora="22:14" t={0.6}>
              Boa noite! Vocês têm horário amanhã?
            </BalaoDaConversa>
            <RespostaDigitada digitaEm={1.3} hora="22:14" t={2.6}>
              Boa noite! Tenho às 9h ou às 14h. Qual fica melhor?
            </RespostaDigitada>
            <BalaoDaConversa lado="recebida" hora="22:15" t={4}>
              Às 14h.
            </BalaoDaConversa>
            <RespostaDigitada digitaEm={4.6} hora="22:15" t={5.7}>
              Pronto, marcado para amanhã às 14h.
            </RespostaDigitada>
          </div>
          <div className="celular-reflexo" />
        </div>
      </div>
      <CartaoDeVidro posicao="celular-cartao-novo" icone={UserPlus} t={0.9}>
        Novo cliente
      </CartaoDeVidro>
      <CartaoDeVidro posicao="celular-cartao-horario" icone={CalendarCheck} t={6.2}>
        Horário marcado na agenda
      </CartaoDeVidro>
    </div>
  );
}

export default function PainelMarca() {
  return (
    <aside data-slot="painel-marca" className="painel-marca">
      <Divisor />
      <Divisor deitado />
      <div className="painel-marca-recorte brand-grad-painel">
        <svg className="painel-marca-foguete" data-slot="painel-marca-foguete" viewBox="152 26 80 148" aria-hidden>
          <DesenhoDoFoguete idDoRastro="painel-marca-rastro" />
        </svg>
        <div className="painel-marca-texto">
          <h2>
            A central inteligente do seu <span>WhatsApp</span>.
          </h2>
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
