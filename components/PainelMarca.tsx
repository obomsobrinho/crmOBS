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

// ── O divisor: balões de conversa em três camadas ───────────────────────────
// Cada balão é medido no eixo do divisor: `y` e `h` ao longo dele, `alcance` para
// fora do painel. Os mesmos dados desenham a borda vertical do computador e a
// horizontal da faixa do celular, trocando x por y.

type Balao = { y: number; h: number; alcance: number; ponta?: boolean };

const ESPESSURA = 200;
const COMPRIMENTO = 1000;
const RAIO = 46;

const CAMADAS: { classe: string; baloes: Balao[] }[] = [
  {
    classe: "divisor-claro",
    baloes: [
      { y: 8, h: 150, alcance: 146 },
      { y: 130, h: 158, alcance: 170, ponta: true },
      { y: 280, h: 190, alcance: 136 },
      { y: 438, h: 172, alcance: 164, ponta: true },
      { y: 590, h: 150, alcance: 146 },
      { y: 700, h: 170, alcance: 172, ponta: true },
      { y: 852, h: 140, alcance: 152 },
    ],
  },
  {
    classe: "divisor-medio",
    baloes: [
      { y: 4, h: 96, alcance: 118 },
      { y: 72, h: 136, alcance: 150 },
      { y: 190, h: 170, alcance: 112, ponta: true },
      { y: 342, h: 130, alcance: 156 },
      { y: 452, h: 196, alcance: 118, ponta: true },
      { y: 630, h: 124, alcance: 158 },
      { y: 736, h: 150, alcance: 120 },
      { y: 862, h: 132, alcance: 150, ponta: true },
    ],
  },
  {
    classe: "divisor-forte",
    baloes: [
      { y: 0, h: 92, alcance: 100 },
      { y: 72, h: 168, alcance: 78, ponta: true },
      { y: 222, h: 112, alcance: 114 },
      { y: 316, h: 158, alcance: 82 },
      { y: 456, h: 112, alcance: 110, ponta: true },
      { y: 546, h: 170, alcance: 76 },
      { y: 698, h: 118, alcance: 114 },
      { y: 798, h: 124, alcance: 86, ponta: true },
      { y: 904, h: 96, alcance: 104 },
      // O corpo da camada: garante que a borda reta do painel nunca apareça.
      { y: 0, h: 1000, alcance: 62 },
    ],
  },
];

function caminhoDoBalao({ y, h, alcance, ponta }: Balao, deitado: boolean) {
  const p = (a: number, b: number) => (deitado ? `${b} ${a}` : `${a} ${b}`);
  const borda = ESPESSURA - alcance;
  const fim = ESPESSURA + 40;
  const base = y + h;
  const fecho = ponta
    ? `Q${p(borda, base - 4)} ${p(borda - 24, base + 12)}Q${p(borda + 18, base + 10)} ${p(borda + 48, base)}`
    : `Q${p(borda, base)} ${p(borda + RAIO, base)}`;
  return `M${p(fim, y)}L${p(borda + RAIO, y)}Q${p(borda, y)} ${p(borda, y + RAIO)}L${p(borda, base - RAIO)}${fecho}L${p(fim, base)}Z`;
}

/** As três camadas, em pé (computador) ou deitadas (faixa do celular). */
function Divisor({ deitado = false }: { deitado?: boolean }) {
  const idDoTom = deitado ? "divisor-tom-deitado" : "divisor-tom";
  return (
    <div className={deitado ? "divisor divisor-deitado" : "divisor"} aria-hidden>
      {CAMADAS.map(({ classe, baloes }) => (
        <svg
          key={classe}
          className={classe}
          viewBox={deitado ? `0 0 ${COMPRIMENTO} ${ESPESSURA}` : `0 0 ${ESPESSURA} ${COMPRIMENTO}`}
          preserveAspectRatio="none"
        >
          {classe === "divisor-forte" && (
            <defs>
              <linearGradient id={idDoTom} x1="0" y1="0" x2={deitado ? "1" : "0"} y2={deitado ? "0" : "1"}>
                <stop offset="0" stopColor="var(--brand-grad-start)" />
                {/* Deitada, ela encosta na borda de cima da faixa, que só chega
                    perto do meio do degradê. Em pé, a borda esquerda vai além. */}
                <stop
                  offset="1"
                  stopColor={
                    deitado
                      ? "color-mix(in srgb, var(--brand-grad-start) 19%, var(--brand-grad-mid))"
                      : "var(--brand-grad-mid)"
                  }
                />
              </linearGradient>
            </defs>
          )}
          <path
            d={baloes.map((b) => caminhoDoBalao(b, deitado)).join("")}
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
