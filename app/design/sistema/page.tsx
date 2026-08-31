"use client";

import * as React from "react";
import {
  Bell,
  ChevronRight,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";
import { Switch, SwitchTrack, SwitchThumb } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// GALERIA DO DESIGN SYSTEM. Dev-only, liberada pelo proxy junto com o resto de
// /design.
//
// ⚠️ A REGRA QUE FAZ ESTA PÁGINA VALER ALGUMA COISA: ela NÃO repete nenhum
// valor. Toda amostra pinta com o token e depois LÊ de volta o valor computado
// pelo navegador (`getComputedStyle`). Número escrito aqui à mão seria a mesma
// coisa que os cards HTML da versão anterior, que envelheceram citando tokens
// já apagados.
//
// Consequência prática: se alguém trocar `--brand-fill`, esta página mostra o
// valor novo sozinha; se alguém APAGAR um token, a amostra aparece vazia, que é
// o alarme.
//
// A prosa do sistema (o porquê de cada decisão) mora em docs/design-system/.
// Aqui é só o que dá para ver.

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Leitura dos valores reais                                           */
/* ------------------------------------------------------------------ */

/** Lê variáveis CSS do `<html>`, já resolvidas pelo tema em vigor. */
function useValorDoToken(nomes: readonly string[]) {
  const [valores, setValores] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const ler = () => {
      const cs = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const n of nomes) out[n] = cs.getPropertyValue(n).trim();
      setValores(out);
    };
    ler();
    // O tema vem de cookie e troca o `data-theme` do <html>: sem observar isso,
    // os valores ficariam congelados no tema em que a página abriu.
    const obs = new MutationObserver(ler);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, [nomes]);

  return valores;
}

/**
 * Mede o texto renderizado de verdade, em vez de repetir a escala.
 *
 * Acha as amostras por `data-papel` e NÃO por ref. Com um objeto de refs, ler
 * `refs.numero` na marcação é acesso a ref durante o render, que o
 * `react-hooks/refs` reprova (9 erros); e um `useRef` por papel seriam dez
 * declarações para uma medição só. O atributo também deixa a amostra
 * autoexplicativa no inspetor.
 */
function useMedidaDoTexto() {
  const [medidas, setMedidas] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const medir = () => {
      const out: Record<string, string> = {};
      for (const el of document.querySelectorAll<HTMLElement>("[data-papel]")) {
        const cs = getComputedStyle(el);
        const tam = Math.round(parseFloat(cs.fontSize));
        const alt = Math.round(parseFloat(cs.lineHeight));
        out[el.dataset.papel!] = `${tam} / ${alt} · peso ${cs.fontWeight}`;
      }
      setMedidas(out);
    };
    medir();
    const obs = new MutationObserver(medir);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  return medidas;
}

/* ------------------------------------------------------------------ */
/* Moldura                                                             */
/* ------------------------------------------------------------------ */

const SECOES = [
  ["cor", "Cor"],
  ["superficie", "Superfície"],
  ["tipografia", "Tipografia"],
  ["geometria", "Geometria"],
  ["animacao", "Animação"],
  ["componentes", "Componentes"],
] as const;

function Secao({
  id,
  titulo,
  regra,
  children,
}: {
  id: string;
  titulo: string;
  /** A regra que manda nesta seção. Uma frase, e ela é o conteúdo. */
  regra: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-titulo text-ink">{titulo}</h2>
      <p className="mb-4 mt-1 max-w-3xl text-apoio text-ink-2">{regra}</p>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Bloco({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-raised p-6 shadow-[var(--panel-shadow)]">
      <h3 className="font-display text-cartao text-ink">{titulo}</h3>
      {nota && <p className="mt-1 max-w-3xl text-legenda text-ink-3">{nota}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Uma amostra de cor. O valor embaixo é LIDO, nunca escrito. */
function Amostra({
  token,
  rotulo,
  valor,
  tinta,
  formato = "quadrado",
}: {
  token: string;
  rotulo: string;
  valor?: string;
  /** Token de tinta para escrever POR CIMA, quando o par existe. */
  tinta?: string;
  formato?: "quadrado" | "linha";
}) {
  return (
    <div className="min-w-0">
      <div
        className={
          formato === "quadrado"
            ? "flex h-14 items-center justify-center rounded-lg border border-line"
            : "h-4 rounded-lg border border-line"
        }
        style={{
          background: `var(${token})`,
          color: tinta ? `var(${tinta})` : undefined,
        }}
      >
        {tinta && formato === "quadrado" && (
          <span className="text-legenda font-semibold">Aa</span>
        )}
      </div>
      <p className="mt-1.5 truncate text-legenda text-ink-2">{rotulo}</p>
      <p className="truncate font-mono text-[11px] text-ink-3">{token}</p>
      {/* `data-token` existe para o HTML EXPORTADO conseguir recalcular este
          valor sozinho. Sem ele, o export congelaria o número do tema em que a
          foto foi tirada e mentiria ao trocar de tema. */}
      <p
        data-token={token}
        className="truncate font-mono text-[11px] text-ink-faint"
      >
        {valor || "sem valor"}
      </p>
    </div>
  );
}

/** Amostra de TINTA: a cor como texto sobre superfície, que é o uso real. */
function AmostraTinta({
  token,
  rotulo,
  valor,
}: {
  token: string;
  rotulo: string;
  valor?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-bloco p-3">
      <p className="text-corpo font-semibold" style={{ color: `var(${token})` }}>
        {rotulo}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] text-ink-3">{token}</p>
      {/* `data-token` existe para o HTML EXPORTADO conseguir recalcular este
          valor sozinho. Sem ele, o export congelaria o número do tema em que a
          foto foi tirada e mentiria ao trocar de tema. */}
      <p
        data-token={token}
        className="truncate font-mono text-[11px] text-ink-faint"
      >
        {valor || "sem valor"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

const TOKENS = [
  "--brand-fill",
  "--brand-on",
  "--brand-ink",
  "--brand-surface",
  "--brand-line",
  "--human-fill",
  "--human-on",
  "--human-ink",
  "--human-surface",
  "--human-line",
  "--send-fill",
  "--send-on",
  "--warn-fill",
  "--warn-on",
  "--warn-ink",
  "--warn-surface",
  "--warn-line",
  "--danger-fill",
  "--danger-on",
  "--danger-ink",
  "--danger-surface",
  "--danger-line",
  "--ink",
  "--ink-2",
  "--ink-3",
  "--ink-faint",
  "--line",
  "--line-soft",
  "--line-strong",
  "--canvas",
  "--sunken",
  "--raised",
  "--inset",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--h-field",
  "--h-primary",
  "--h-control",
  "--h-chrome",
  "--dur-fast",
  "--dur",
  "--dur-slow",
  "--dur-cartao",
  "--dur-numero",
  "--dur-barra",
  "--dur-troca",
  "--ease-out",
  "--ease-dado",
  "--brand-grad-start",
  "--brand-grad-end",
] as const;

const MATIZES = [
  { nome: "Marca e IA", chave: "brand", quando: "marca, IA" },
  { nome: "Humano", chave: "human", quando: '"você" respondeu, enviar' },
  { nome: "Precisa de você", chave: "warn", quando: "IA pausada, aviso" },
  { nome: "Erro e bloqueio", chave: "danger", quando: "erro, bloqueio" },
] as const;

export default function DesignSistemaPage() {
  const v = useValorDoToken(TOKENS);

  const m = useMedidaDoTexto();

  const [ligado, setLigado] = React.useState(true);
  const [aba, setAba] = React.useState("um");
  const [dialogAberto, setDialogAberto] = React.useState(false);


  return (
    <TooltipProvider>
      <div className="min-h-screen bg-canvas">
        {/* Índice fixo: a página é longa, e rolar procurando seção é o jeito
            mais rápido de ninguém usar isto. */}
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-8 py-4 backdrop-blur">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <h1 className="font-display text-titulo text-ink">
              Sistema de design
            </h1>
            <p className="text-legenda text-ink-3">
              Os valores são LIDOS do CSS em tempo real, nunca copiados. Troque o
              tema e a página inteira responde.
            </p>
            <nav className="ml-auto flex flex-wrap gap-1">
              {SECOES.map(([id, rotulo]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-lg border border-line bg-raised px-2.5 py-1 text-legenda text-ink-2 transition-colors hover:bg-bloco hover:text-ink"
                >
                  {rotulo}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <main className="space-y-10 px-8 py-8">
          {/* ---------------------------------------------------------- */}
          <Secao
            id="cor"
            titulo="Cor"
            regra={
              <>
                <strong className="text-ink">
                  Cada matiz tem quatro papéis
                </strong>
                , e é a escolha do papel que garante contraste. Nunca usar{" "}
                <code className="text-ink">fill</code> como cor de texto, nunca
                usar <code className="text-ink">ink</code> como fundo. Foi isso
                que produziu as 18 reprovações WCAG da rodada anterior.
              </>
            }
          >
            {MATIZES.map((mz) => (
              <Bloco
                key={mz.chave}
                titulo={mz.nome}
                nota={<>significa: {mz.quando}</>}
              >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <Amostra
                    token={`--${mz.chave}-fill`}
                    rotulo="fill · fundo cheio"
                    tinta={`--${mz.chave}-on`}
                    valor={v[`--${mz.chave}-fill`]}
                  />
                  <Amostra
                    token={`--${mz.chave}-on`}
                    rotulo="on · tinta sobre o fill"
                    valor={v[`--${mz.chave}-on`]}
                  />
                  <AmostraTinta
                    token={`--${mz.chave}-ink`}
                    rotulo="ink · como TEXTO"
                    valor={v[`--${mz.chave}-ink`]}
                  />
                  <Amostra
                    token={`--${mz.chave}-surface`}
                    rotulo="surface · fundo tingido"
                    tinta={`--${mz.chave}-ink`}
                    valor={v[`--${mz.chave}-surface`]}
                  />
                  <Amostra
                    token={`--${mz.chave}-line`}
                    rotulo="line · borda"
                    formato="linha"
                    valor={v[`--${mz.chave}-line`]}
                  />
                </div>
              </Bloco>
            ))}

            <Bloco
              titulo="Enviar"
              nota="Par separado, e ele INVERTE por tema: no claro a tinta é branca, então o verde precisa ser um degrau mais escuro; no escuro o verde clareia e a tinta escurece. Branco sobre o verde claro daria 1,99:1."
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Amostra
                  token="--send-fill"
                  rotulo="send-fill"
                  tinta="--send-on"
                  valor={v["--send-fill"]}
                />
                <Amostra
                  token="--send-on"
                  rotulo="send-on"
                  valor={v["--send-on"]}
                />
              </div>
            </Bloco>

            <Bloco
              titulo="Tinta, em quatro níveis"
              nota="ink > ink-2 > ink-3 (piso de texto, mínimo 12px) > ink-faint, que NUNCA é texto: só ícone e divisor."
            >
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <AmostraTinta
                  token="--ink"
                  rotulo="Texto principal"
                  valor={v["--ink"]}
                />
                <AmostraTinta
                  token="--ink-2"
                  rotulo="Texto secundário"
                  valor={v["--ink-2"]}
                />
                <AmostraTinta
                  token="--ink-3"
                  rotulo="Piso de texto"
                  valor={v["--ink-3"]}
                />
                <div className="min-w-0 rounded-lg border border-line bg-bloco p-3">
                  <div className="flex items-center gap-2">
                    <ChevronRight size={16} className="text-ink-faint" />
                    <span
                      className="h-px flex-1"
                      style={{ background: "var(--ink-faint)" }}
                    />
                  </div>
                  <p className="mt-2 text-legenda text-danger-ink">
                    nunca como texto
                  </p>
                  <p className="truncate font-mono text-[11px] text-ink-3">
                    --ink-faint
                  </p>
                  <p className="truncate font-mono text-[11px] text-ink-faint">
                    {v["--ink-faint"] || "sem valor"}
                  </p>
                </div>
              </div>
            </Bloco>

            <Bloco
              titulo="Linhas"
              nota="line é a borda do CARTÃO; line-soft é o divisor INTERNO (cabeçalho, rodapé, separador de lista). A diferença entre as duas é o que faz um cartão ter contorno sem parecer uma tabela."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Amostra
                  token="--line"
                  rotulo="line · borda de cartão"
                  formato="linha"
                  valor={v["--line"]}
                />
                <Amostra
                  token="--line-soft"
                  rotulo="line-soft · divisor interno"
                  formato="linha"
                  valor={v["--line-soft"]}
                />
                <Amostra
                  token="--line-strong"
                  rotulo="line-strong · foco, guia"
                  formato="linha"
                  valor={v["--line-strong"]}
                />
              </div>
            </Bloco>

            <Bloco
              titulo="O azul"
              nota="Existe só porque a logo termina nele. Escopo fechado: gradiente de marca, símbolo e superfície decorativa a partir de 28px. Não pinta texto, não pinta ícone, não pinta estado."
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="brand-grad flex h-14 w-40 items-center justify-center rounded-xl text-apoio font-semibold">
                  .brand-grad
                </div>
                <p className="font-mono text-[11px] text-ink-3">
                  {v["--brand-grad-start"] || "sem valor"} →{" "}
                  {v["--brand-grad-end"] || "sem valor"}
                </p>
              </div>
            </Bloco>
          </Secao>

          {/* ---------------------------------------------------------- */}
          <Secao
            id="superficie"
            titulo="Superfície"
            regra={
              <>
                Quatro camadas, e{" "}
                <strong className="text-ink">
                  a hierarquia INVERTE entre os temas
                </strong>
                . No claro o cartão sobe (branco) e a conversa recua; no escuro o
                cartão é mais claro que o fundo. É o que faz a mesma marcação ler
                certo nos dois.
              </>
            }
          >
            <Bloco titulo="As quatro camadas">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Amostra
                  token="--canvas"
                  rotulo="canvas · fundo da janela"
                  tinta="--ink"
                  valor={v["--canvas"]}
                />
                <Amostra
                  token="--sunken"
                  rotulo="sunken · menu, conversa"
                  tinta="--ink"
                  valor={v["--sunken"]}
                />
                <Amostra
                  token="--raised"
                  rotulo="raised · cartão"
                  tinta="--ink"
                  valor={v["--raised"]}
                />
                <Amostra
                  token="--inset"
                  rotulo="inset · campo, bloco"
                  tinta="--ink"
                  valor={v["--inset"]}
                />
              </div>
              {/* Aqui morava um aviso de que `--raised` e `--s-conteudo` eram a
                  mesma cor com dois nomes. Saiu porque o defeito foi corrigido
                  em 30/08/2026: `--s-conteudo` deixou de existir e os 17 usos de
                  `bg-conteudo` viraram `bg-raised`. O aviso era CALCULADO, então
                  ele sumiria sozinho de qualquer forma; tirar o código junto é o
                  que evita a próxima pessoa procurar um token que já era. */}
            </Bloco>

            <Bloco
              titulo="A escada, em uso"
              nota="Cartão, bloco dentro do cartão, campo dentro do bloco. Dentro de um cartão a separação é linha de 1px, nunca outro cartão."
            >
              <div className="rounded-xl border border-line bg-raised p-4">
                <p className="text-legenda text-ink-3">cartão (raised)</p>
                <div className="mt-2 rounded-lg border border-line bg-bloco p-4">
                  <p className="text-legenda text-ink-3">bloco (s-bloco)</p>
                  <Input className="mt-2" placeholder="campo (input-bg)" />
                </div>
              </div>
            </Bloco>
          </Secao>

          {/* ---------------------------------------------------------- */}
          <Secao
            id="tipografia"
            titulo="Tipografia"
            regra={
              <>
                Manrope no corpo, Space Grotesk em título e numeral. Tamanho e
                entrelinha <strong className="text-ink">travados juntos</strong>,
                para o mesmo tamanho nunca aparecer com dois ritmos. Piso
                absoluto: 12px.
              </>
            }
          >
            <Bloco
              titulo="A hierarquia de título, em três níveis"
              nota="Os níveis 2 e 3 NÃO são intercambiáveis: o 3 é feito para ser discreto e não competir com o valor que apresenta."
            >
              <ol className="space-y-4">
                <li>
                  <p
                    data-papel="titulo"
                    className="font-display text-titulo text-ink"
                  >
                    Painel
                  </p>
                  <p className="text-legenda text-ink-3">
                    <code>text-titulo</code> · título da PÁGINA · <span data-medida="titulo">{m.titulo}</span>
                  </p>
                </li>
                <li>
                  <p
                    data-papel="cartao"
                    className="font-display text-cartao text-ink"
                  >
                    Movimento
                  </p>
                  <p className="text-legenda text-ink-3">
                    <code>text-cartao</code> · título de bloco COM ESTRUTURA
                    PRÓPRIA (faixa, lista, gráfico) · <span data-medida="cartao">{m.cartao}</span>
                  </p>
                </li>
                <li>
                  <p
                    data-papel="rotulo"
                    className="text-rotulo uppercase text-ink-3"
                  >
                    Atendidas sem você
                  </p>
                  <p className="text-legenda text-ink-3">
                    <code>text-rotulo</code> · rótulo de um VALOR, cartão simples
                    ou sub-bloco recolhível · <span data-medida="rotulo">{m.rotulo}</span>
                  </p>
                </li>
              </ol>
              <p className="mt-4 text-legenda text-warn-ink">
                ⚠️ O papel chama-se <code>cartao</code> e não <code>bloco</code>{" "}
                porque existe <code>--color-bloco</code>: com o mesmo nome, o
                Tailwind resolvia COR e não tamanho, e o título nascia sem os
                16px e sem o peso 600.
              </p>
            </Bloco>

            <Bloco titulo="Papéis de texto">
              <div className="space-y-3">
                <div>
                  <p data-papel="display" className="text-display text-ink">
                    text-display
                  </p>
                  <p className="text-legenda text-ink-3">
                    <span data-medida="display">{m.display}</span> ·{" "}
                    <span className="text-warn-ink">sem uso hoje</span>
                  </p>
                </div>
                <Separator />
                <div>
                  <p data-papel="corpo" className="text-corpo text-ink">
                    text-corpo, texto de leitura e mensagem
                  </p>
                  <p className="text-legenda text-ink-3"><span data-medida="corpo">{m.corpo}</span></p>
                </div>
                <Separator />
                <div>
                  <p data-papel="apoio" className="text-apoio text-ink-2">
                    text-apoio, o mais usado da interface
                  </p>
                  <p className="text-legenda text-ink-3"><span data-medida="apoio">{m.apoio}</span></p>
                </div>
                <Separator />
                <div>
                  <p data-papel="legenda" className="text-legenda text-ink-3">
                    text-legenda, metadado e escopo
                  </p>
                  <p className="text-legenda text-ink-3"><span data-medida="legenda">{m.legenda}</span></p>
                </div>
              </div>
            </Bloco>

            <Bloco
              titulo="Degraus de numeral"
              nota="NÃO são papéis tipográficos: escopo fechado no valor de um indicador. Existem porque o painel tinha dez números e todos em 24px."
            >
              <div className="flex flex-wrap items-end gap-8">
                <div>
                  <p
                    data-papel="manchete"
                    className="font-display text-manchete tabular-nums text-brand-ink"
                  >
                    213
                  </p>
                  <p className="text-legenda text-ink-3">
                    text-manchete · <span data-medida="manchete">{m.manchete}</span>
                  </p>
                </div>
                <div>
                  <p
                    data-papel="destaque"
                    className="font-display text-destaque tabular-nums text-ink"
                  >
                    42
                  </p>
                  <p className="text-legenda text-ink-3">
                    text-destaque · <span data-medida="destaque">{m.destaque}</span>
                  </p>
                </div>
                <div>
                  <p
                    data-papel="numero"
                    className="font-display text-numero tabular-nums text-ink"
                  >
                    31
                  </p>
                  <p className="text-legenda text-ink-3">
                    text-numero · <span data-medida="numero">{m.numero}</span>
                  </p>
                </div>
              </div>
            </Bloco>
          </Secao>

          {/* ---------------------------------------------------------- */}
          <Secao
            id="geometria"
            titulo="Geometria"
            regra={
              <>
                Raio em quatro degraus e{" "}
                <strong className="text-ink">
                  altura de controle em quatro
                </strong>
                . Quem for do mesmo degrau tem a MESMA altura, sempre; o que muda
                é o peso visual.
              </>
            }
          >
            <Bloco titulo="Raio">
              <div className="flex flex-wrap gap-6">
                {(
                  [
                    ["--radius-sm", "rounded-sm", "anel de foco"],
                    ["--radius-md", "rounded-md", "peça pequena"],
                    ["--radius-lg", "rounded-lg", "campo, botão, bloco"],
                    ["--radius-xl", "rounded-xl", "CARTÃO"],
                  ] as const
                ).map(([token, classe, uso]) => (
                  <div key={token}>
                    <div
                      className="h-16 w-16 border border-line-strong bg-bloco"
                      style={{ borderRadius: `var(${token})` }}
                    />
                    <p className="mt-1.5 text-legenda text-ink-2">{classe}</p>
                    <p data-token={token} className="font-mono text-[11px] text-ink-3">
                      {v[token] || "sem valor"}
                    </p>
                    <p className="text-[11px] text-ink-faint">{uso}</p>
                  </div>
                ))}
              </div>
            </Bloco>

            <Bloco
              titulo="Altura de controle"
              nota="field é o único que pode crescer. As barras abaixo têm a altura do token, lida do CSS."
            >
              <div className="space-y-2">
                {(
                  [
                    ["--h-field", "field", "campo de digitar"],
                    ["--h-primary", "primary", "ação principal de um bloco"],
                    ["--h-control", "control", "ação secundária, aba, enviar"],
                    ["--h-chrome", "chrome", "botão de ícone da moldura"],
                  ] as const
                ).map(([token, nome, uso]) => (
                  <div key={token} className="flex items-center gap-3">
                    <div
                      className="flex w-44 items-center justify-center rounded-lg border border-line bg-bloco text-legenda text-ink-2"
                      style={{ height: `var(${token})` }}
                    >
                      {nome}
                    </div>
                    <span data-token={token} className="font-mono text-[11px] text-ink-3">
                      {v[token] || "sem valor"}
                    </span>
                    <span className="text-legenda text-ink-3">{uso}</span>
                  </div>
                ))}
              </div>
            </Bloco>

            <Bloco
              titulo="Foco"
              nota="Nunca no componente: é global. Campo de texto é a exceção e NÃO usa o anel, porque um retângulo em volta de um retângulo lê como erro; ele acende a própria moldura."
            >
              <div className="flex flex-wrap items-center gap-4">
                <Button>Dê Tab até aqui</Button>
                <Input className="w-56" placeholder="e depois até aqui" />
              </div>
            </Bloco>
          </Secao>

          {/* ---------------------------------------------------------- */}
          <Secao
            id="animacao"
            titulo="Animação"
            regra={
              <>
                CSS da casa, sem biblioteca.{" "}
                <strong className="text-ink">Duas curvas</strong>, e trocar uma
                pela outra muda a sensação: <code>ease-out</code> é INTERFACE
                (algo abrindo), <code>ease-dado</code> é DADO (um número
                correndo), que desacelera muito mais no fim.
              </>
            }
          >
            <Bloco titulo="Curvas e durações">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-bloco p-3">
                  <p className="text-apoio font-semibold text-ink">
                    Curva de interface
                  </p>
                  <p className="font-mono text-[11px] text-ink-3">
                    --ease-out: {v["--ease-out"] || "sem valor"}
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bloco p-3">
                  <p className="text-apoio font-semibold text-ink">
                    Curva de dado
                  </p>
                  <p className="font-mono text-[11px] text-ink-3">
                    --ease-dado: {v["--ease-dado"] || "sem valor"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    "--dur-fast",
                    "--dur",
                    "--dur-slow",
                    "--dur-cartao",
                    "--dur-numero",
                    "--dur-barra",
                    "--dur-troca",
                  ] as const
                ).map((t) => (
                  <div key={t} className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-ink-2">
                      {t}
                    </p>
                    <p data-token={t} className="font-mono text-[11px] text-ink-faint">
                      {v[t] || "sem valor"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-legenda text-ink-3">
                ⚠️ A barra cresce em <code>height</code>, não em{" "}
                <code>scaleY</code>: com scaleY o raio do topo chega esmagado. E
                o Tailwind v4 emite <code>-translate-x-1/2</code> como a
                propriedade <code>translate</code>, separada do{" "}
                <code>transform</code>, então keyframe que repita o translate
                SOMA em vez de substituir.
              </p>
            </Bloco>
          </Secao>

          {/* ---------------------------------------------------------- */}
          <Secao
            id="componentes"
            titulo="Componentes"
            regra={
              <>
                A camada base, em <code>components/ui/</code>. Antes de escrever{" "}
                <code>className</code> numa tela,{" "}
                <strong className="text-ink">procurar a variante aqui</strong>:
                se a mesma sopa de classe aparecer duas vezes, ela virou
                variante.
              </>
            }
          >
            <Bloco
              titulo="Button · 8 variantes"
              nota="A cor diz o que a ação FAZ, não a importância dela."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="brand">brand</Button>
                <Button variant="send">
                  <Send size={14} />
                  send
                </Button>
                <Button variant="warn">warn</Button>
                <Button variant="danger">
                  <Trash2 size={14} />
                  danger
                </Button>
                <Button variant="outline">outline</Button>
                <Button variant="ghost">ghost</Button>
                <Button variant="brand-ghost">brand-ghost</Button>
                <div className="rounded-lg bg-menu p-2">
                  <Button variant="rail">rail</Button>
                </div>
              </div>
            </Bloco>

            <Bloco
              titulo="Button · 7 tamanhos"
              nota="Cada um cai num degrau da escala de altura. `none` é para quem tem geometria própria."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button size="field">field 40</Button>
                <Button size="primary">primary 36</Button>
                <Button size="control">control 32</Button>
                <Button size="chrome">chrome 28</Button>
                <Button size="icon-control" aria-label="ícone 32">
                  <Bell size={15} />
                </Button>
                <Button size="icon-chrome" aria-label="ícone 28">
                  <Paperclip size={14} />
                </Button>
                {/* ⚠️ O sétimo TEM que aparecer, senão o título afirma 7 e a
                    amostra mostra 6, que é exatamente o que um design system
                    não pode fazer. Ele não tem altura nem raio próprios, então
                    a moldura tracejada é da AMOSTRA, e não do botão: sem ela
                    não haveria o que ver, e com ela eu estaria inventando
                    geometria que a variante não tem. */}
                <span className="rounded-lg border border-dashed border-line-strong px-2 py-1">
                  <Button size="none" variant="ghost">
                    none
                  </Button>
                </span>
              </div>
            </Bloco>

            <Bloco
              titulo="Badge · 9 variantes"
              nota="Os três delta-* são o selo de variação. O padrão é o NEUTRO e o selo é opcional no cartão: selo colorido em 100% dos cartões é como verde deixa de ser estado e vira enfeite."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="contorno">contorno</Badge>
                <Badge variant="tracejado">Em breve</Badge>
                <Badge variant="contagem">12</Badge>
                <Badge variant="nao-lidas">3</Badge>
                <Badge variant="dia">ontem</Badge>
                <Badge variant="tag">tag</Badge>
                <Badge variant="delta-bom">+17%</Badge>
                <Badge variant="delta-ruim">8s mais lento</Badge>
                <Badge variant="delta-neutro">igual</Badge>
              </div>
            </Bloco>

            <Bloco
              titulo="Stat · 4 variantes"
              nota="A legenda de período é OBRIGATÓRIA: cartão de indicador sem período mente sobre o próprio número."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat variant="bloco">
                  <StatTopo tamanho="operacao">
                    <StatRotulo>variant bloco</StatRotulo>
                    <Badge variant="delta-bom">+19%</Badge>
                  </StatTopo>
                  <StatValor>31</StatValor>
                  <StatFrase>Dentro de um cartão de página</StatFrase>
                  <StatLegenda>últimos 7 dias</StatLegenda>
                </Stat>
                <Stat variant="elevado">
                  <StatTopo tamanho="operacao">
                    <StatRotulo>variant elevado</StatRotulo>
                  </StatTopo>
                  <StatValor>8s</StatValor>
                  <StatFrase>Flutua sobre o canvas</StatFrase>
                  <StatLegenda>últimos 7 dias</StatLegenda>
                </Stat>
                <Stat variant="marca">
                  <StatTopo tamanho="operacao">
                    <StatRotulo>variant marca</StatRotulo>
                  </StatTopo>
                  <StatValor className="text-brand-ink">9</StatValor>
                  <StatFrase>Superfície tingida</StatFrase>
                  <StatLegenda>últimos 7 dias</StatLegenda>
                </Stat>
                <Stat variant="vazio">
                  <StatTopo tamanho="operacao">
                    <StatRotulo>variant vazio</StatRotulo>
                    <Badge variant="tracejado">Em breve</Badge>
                  </StatTopo>
                  <StatValor className="text-ink-faint">XX</StatValor>
                  <StatFrase>
                    O número é literalmente XX, nunca um valor plausível
                  </StatFrase>
                  <StatLegenda>últimos 7 dias</StatLegenda>
                </Stat>
              </div>
            </Bloco>

            <Bloco
              titulo="Tabs · 2 variantes"
              nota="A variante segmentado foi removida em 30/08/2026 por nao ter nenhum consumidor. painel existe porque roxo cheio num seletor de periodo roubaria a cor da serie."
            >
              <div className="flex flex-wrap items-start gap-8">
                <div>
                  <p className="mb-2 text-legenda text-ink-3">sublinhado</p>
                  <Tabs value={aba} onValueChange={setAba}>
                    <TabsList>
                      <TabsTrigger value="um" barra="var(--human-fill)">
                        Responder
                      </TabsTrigger>
                      <TabsTrigger value="dois" barra="var(--warn-fill)">
                        Nota
                      </TabsTrigger>
                      <TabsTrigger value="tres" barra="var(--brand-fill)">
                        Orientar
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div>
                  <p className="mb-2 text-legenda text-ink-3">painel</p>
                  <Tabs value={aba} onValueChange={setAba}>
                    <TabsList variant="painel">
                      <TabsTrigger value="um" variant="painel">
                        Dia
                      </TabsTrigger>
                      <TabsTrigger value="dois" variant="painel">
                        Semana
                      </TabsTrigger>
                      <TabsTrigger value="tres" variant="painel">
                        Mês
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </Bloco>

            <Bloco
              titulo="Switch · 2 tons"
              nota="marca (roxo) para chave que liga um recurso; ativo (verde) para chave que representa ESTADO de operação ligado. O estado chega por PROP, nunca lendo o data-state de um ancestral."
            >
              <div className="flex flex-wrap items-center gap-8">
                <span className="flex items-center gap-2 text-apoio text-ink-2">
                  <Switch
                    checked={ligado}
                    onCheckedChange={setLigado}
                    aria-label="tom marca"
                  >
                    <SwitchTrack checked={ligado} tom="marca">
                      <SwitchThumb checked={ligado} />
                    </SwitchTrack>
                  </Switch>
                  tom marca
                </span>
                <span className="flex items-center gap-2 text-apoio text-ink-2">
                  <Switch
                    checked={ligado}
                    onCheckedChange={setLigado}
                    aria-label="tom ativo"
                  >
                    <SwitchTrack checked={ligado} tom="ativo">
                      <SwitchThumb checked={ligado} />
                    </SwitchTrack>
                  </Switch>
                  tom ativo
                </span>
              </div>
            </Bloco>

            <Bloco titulo="Campos">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Input placeholder="Input padrão" />
                  <Input
                    variant="limpo"
                    placeholder="Input limpo, sem moldura"
                  />
                </div>
                <Textarea placeholder="Textarea" rows={3} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <span className="flex items-center gap-2 text-apoio text-ink-2">
                  <Checkbox defaultChecked aria-label="Checkbox de exemplo" />
                  Checkbox
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="control">
                      <Sparkles size={14} />
                      Passe o mouse
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Tooltip da casa</TooltipContent>
                </Tooltip>
              </div>
            </Bloco>

            <Bloco
              titulo="Avatar · 5 tamanhos"
              nota="Par de fundo tingido mais tinta do mesmo matiz, escolhido por avatarPair(). Nunca branco sobre cor cheia, que dava 2,80:1."
            >
              <div className="flex flex-wrap items-end gap-4">
                {(["xl", "lg", "md", "sm", "xs"] as const).map((s, i) => (
                  <div key={s} className="text-center">
                    <Avatar
                      size={s}
                      style={{
                        background: `var(--av-${i + 1}-bg)`,
                        color: `var(--av-${i + 1}-fg)`,
                      }}
                    >
                      <AvatarFallback>M{i + 1}</AvatarFallback>
                    </Avatar>
                    <p className="mt-1 text-[11px] text-ink-3">{s}</p>
                  </div>
                ))}
              </div>
            </Bloco>

            <Bloco
              titulo="Card · 2 variantes"
              nota="Sem CardHeader e sem CardFooter, de propósito: eles empilhariam moldura dentro de moldura, e dentro de um cartão a separação é linha de 1px."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-4">
                  <p className="text-apoio text-ink-2">variant conteudo</p>
                </Card>
                <Card variant="menu" className="p-4">
                  <p className="text-apoio text-ink-2">variant menu</p>
                </Card>
              </div>
            </Bloco>

            <Bloco
              titulo="Select · 2 tamanhos"
              nota="A lista abre em camada flutuante (portal), então o que dá para mostrar parado é o gatilho, que é a aparência que fica na tela o tempo todo."
            >
              <div className="flex flex-wrap items-center gap-4">
                <Select defaultValue="todos">
                  <SelectTrigger
                    className="w-56"
                    aria-label="Exemplo de select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">size field, 40px</SelectItem>
                    <SelectItem value="um">Outra opção</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue="todos">
                  <SelectTrigger
                    size="control"
                    className="w-56"
                    aria-label="Exemplo de select compacto"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">size control, 32px</SelectItem>
                    <SelectItem value="um">Outra opção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Bloco>

            <Bloco
              titulo="Camadas flutuantes"
              nota="Dialog, Sheet e DropdownMenu vivem em portal: o painel só existe depois do clique, então aqui aparece o GATILHO. No HTML exportado eles ficam congelados, porque o React não vai junto."
            >
              <div className="flex flex-wrap items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="control">
                      DropdownMenu
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Um rótulo</DropdownMenuLabel>
                    <DropdownMenuItem>Um item</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Outro item</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Controlado por estado, e NÃO por `DialogTrigger`: a base não
                    exporta gatilho, e é assim que as telas da casa usam. */}
                <Button
                  variant="outline"
                  size="control"
                  onClick={() => setDialogAberto(true)}
                >
                  Dialog · tamanho confirmacao
                </Button>
                <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
                  <DialogContent tamanho="confirmacao">
                    <DialogTitle>Confirmação</DialogTitle>
                    <DialogDescription>
                      Entra e sai com `.anim-flutuante` e `.anim-fundo`.
                    </DialogDescription>
                  </DialogContent>
                </Dialog>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="control">
                      Sheet · tamanho padrao
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetTitle>Painel lateral</SheetTitle>
                    <SheetDescription>
                      Arquivo separado do dialog, com `.anim-lateral` própria: o
                      centramento do dialog brigaria com o translate daqui.
                    </SheetDescription>
                  </SheetContent>
                </Sheet>
              </div>
            </Bloco>

            <Bloco
              titulo="ScrollArea e Separator"
              nota="A barra imita a nativa que o globals.css já estiliza: 8px, em overlay, sem setas. O `fade` acende a sombra de rolagem no topo e no fim."
            >
              <ScrollArea className="h-28 rounded-lg border border-line bg-bloco p-3">
                <div className="space-y-2">
                  {Array.from({ length: 8 }, (_, i) => (
                    <React.Fragment key={i}>
                      <p className="text-apoio text-ink-2">
                        Linha {i + 1} de uma lista que rola
                      </p>
                      {i < 7 && <Separator />}
                    </React.Fragment>
                  ))}
                </div>
              </ScrollArea>
            </Bloco>

            <Bloco
              titulo="As sete regras da base"
              nota="Cada uma foi paga com um bug."
            >
              <ol className="space-y-1.5 text-apoio text-ink-2">
                <li>
                  1. Geometria mora no <code>size</code> do cva, não na base:
                  raio, gap e peso da fonte.
                </li>
                <li>
                  2. Nunca <code>[&amp;_svg]:size-4</code>: vence o{" "}
                  <code>width</code> do lucide e engorda todo ícone de 13, 14 e
                  15px.
                </li>
                <li>3. Nunca anel de foco no componente: o foco é global.</li>
                <li>
                  4. <code>data-slot</code> DEPOIS do spread. E{" "}
                  <code>data-slot</code> vindo de FORA é ignorado: quem precisa
                  se marcar usa outro <code>data-*</code>.
                </li>
                <li>
                  5. Não depender do <code>data-state</code> de um ancestral:
                  passar estado por prop.
                </li>
                <li>
                  6. O <code>tailwind-merge</code> precisa conhecer a escala
                  tipográfica, senão trata <code>text-corpo</code> como COR e
                  descarta a tinta em silêncio.
                </li>
                <li>
                  7. Root do Radix não renderiza elemento: dois gatilhos precisam
                  se encadear ao MESMO elemento.
                </li>
              </ol>
            </Bloco>
          </Secao>

          <footer className="border-t border-line pt-6 text-legenda text-ink-3">
            O porquê de cada decisão está em <code>docs/design-system/</code>. O
            que está medido e ainda sem decisão está em{" "}
            <code>docs/design-system/pendencias.md</code>.
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}
