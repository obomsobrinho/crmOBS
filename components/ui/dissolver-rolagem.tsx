"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A REGRA DA CASA PARA ÁREA ROLÁVEL (19/09/2026).
 *
 * **Toda área que rola dissolve nas bordas, e nunca corta o conteúdo numa linha
 * reta.** Sem isso o último item aparece fatiado contra o vizinho, e quem lê não
 * sabe se aquilo acabou ou se tem mais.
 *
 * Duas regras saem dela, e as duas foram pagas com retrabalho:
 *
 * 1. **Um sinal por fato.** A dissolução já diz "tem mais conteúdo deste lado".
 *    Empilhar uma sombra em cima dela é um segundo sinal para o mesmo fato, no
 *    mesmo lugar, e lê como sujeira. As duas sombras de rolagem da conversa
 *    saíram por isso, depois de dois prints do dono.
 * 2. **A dissolução tem que ser MAIOR que o item que ela dissolve.** O padrão de
 *    28px serve para lista de texto sobre superfície lisa. A conversa passa 80,
 *    porque o balão dela tem 65px em média: em 28px ele ainda está em quase
 *    metade da opacidade quando a borda chega, então não dissolve, é FATIADO.
 *
 * ⚠️ POR QUE UM HOOK, E NÃO SÓ O `ScrollArea`: metade das áreas roláveis desta
 * casa é um `div` com `overflow-y-auto`, não o componente. Trocar todas por
 * `ScrollArea` mexeria no layout de cada uma (respiro, barra sobreposta) sem
 * necessidade. Com o hook, a área ganha a regra recebendo um `ref` e um `style`,
 * e continua sendo o que era.
 *
 * ⚠️ POR QUE NÃO É CSS PURO: a versão com `animation-timeline: scroll(self y)`
 * (a técnica que o `scroll-fade` do shadcn usa) foi tentada e MEDIDA aqui em
 * 19/09/2026: o `@supports` passa, as animações entram em `running`, e a
 * `ScrollTimeline` fica com `currentTime` nulo, ou seja, não avança. Medir e
 * aplicar por JS funciona, está coberto por teste e é um mecanismo só.
 */

/**
 * Os TRÊS degraus de dissolução, e eles são vocabulário, não número solto.
 *
 * ⚠️ O degrau se escolhe pela ALTURA DO ITEM daquela área, medida no navegador,
 * e não por gosto: é a regra 2 acima. Os valores de referência foram medidos na
 * /design em 19/09/2026 (linha de dado 41px, item da lista de conversas 82px,
 * balão da conversa entre 65 e 116 conforme a largura da janela).
 *
 * ⚠️ E existe um TETO implícito: a dissolução não deve passar de uns 15% da
 * altura da área, senão ela deixa de ser borda e vira uma tarja que apaga
 * informação útil. Se um item for alto demais para caber nisso, o problema é o
 * item, não a dissolução.
 */
/** Texto corrido, formulário, bloco de prompt. */
export const DISSOLVER_PADRAO = 32;
/** Lista de itens com mais de uma linha: conversas, cards, documentos, membros. */
export const DISSOLVER_LISTA = 72;
/** A conversa. O balão é o item mais alto da casa. */
export const DISSOLVER_BALAO = 80;

/**
 * Liga a regra numa área rolável qualquer.
 *
 * Devolve o `ref` para o elemento que rola, o `style` da máscara, o `onScroll`
 * e `temMais`, que é quem sabe se sobrou conteúdo embaixo (a `SetaMais` usa).
 *
 * `deps` existe para re-medir quando o CONTEÚDO muda sem mudar de tamanho na
 * hora: o `ResizeObserver` cobre a maioria dos casos, mas uma lista que troca de
 * itens no mesmo instante em que o pai remede é uma corrida conhecida.
 */
export function useDissolverRolagem<T extends HTMLElement = HTMLDivElement>(
  tamanho: number | false = DISSOLVER_PADRAO,
  deps: React.DependencyList = []
) {
  const ref = React.useRef<T>(null);
  const [bordas, setBordas] = React.useState({ topo: false, fundo: false });
  const px = tamanho === false ? 0 : tamanho;

  const medir = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const topo = el.scrollTop > 4;
    const fundo = el.scrollHeight - el.scrollTop - el.clientHeight > 8;
    setBordas((b) =>
      b.topo === topo && b.fundo === fundo ? b : { topo, fundo }
    );
  }, []);

  // Mede na montagem e sempre que o conteúdo mudar de tamanho. Só ouvir o evento
  // de rolagem não bastaria: numa lista que ainda não foi rolada, ou que acabou
  // de receber um item, não há evento nenhum e a máscara nasceria errada.
  React.useEffect(() => {
    if (!px) return;
    const el = ref.current;
    if (!el) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    const conteudo = el.firstElementChild;
    if (conteudo) observador.observe(conteudo);
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, medir, ...deps]);

  const style = React.useMemo<React.CSSProperties>(() => {
    if (!px || (!bordas.topo && !bordas.fundo)) return {};
    const paradas = [
      bordas.topo ? "transparent 0" : "#000 0",
      bordas.topo ? `#000 ${px}px` : null,
      bordas.fundo ? `#000 calc(100% - ${px}px)` : null,
      bordas.fundo ? "transparent 100%" : "#000 100%",
    ].filter(Boolean);
    const g = `linear-gradient(to bottom, ${paradas.join(", ")})`;
    return { maskImage: g, WebkitMaskImage: g };
  }, [px, bordas]);

  return {
    ref,
    style,
    medir,
    /** Sobrou conteúdo escondido embaixo? É o que acende a `SetaMais`. */
    temMais: bordas.fundo,
    onScroll: medir as React.UIEventHandler<T>,
  };
}

/**
 * A SETA de "tem mais coisa aqui embaixo".
 *
 * A dissolução diz que há conteúdo escondido, mas ela é discreta de propósito, e
 * numa lista longa a pessoa pode simplesmente não reparar. A seta é o mesmo fato
 * dito de um jeito que não passa despercebido, e ela não briga com a regra "um
 * sinal por fato" porque **também faz alguma coisa**: clicar leva ao fim. Sinal
 * que é atalho não é decoração.
 *
 * ⚠️ Ela só existe onde ROLAR É A NAVEGAÇÃO: a conversa e a lista de conversas.
 * Num bloco curto dentro de um formulário, um botão flutuante sobre o conteúdo é
 * mais ruído do que ajuda.
 *
 * ⚠️ `aria-hidden` NÃO, e `tabIndex={-1}` SIM. Ela é redundante para quem navega
 * por teclado (a área rolável já é alcançável e as setas do teclado rolam), mas
 * esconder um botão do leitor de tela e deixá-lo clicável com o mouse é o pior
 * dos dois mundos. Ela tem nome acessível e fica fora da ordem de tabulação.
 */
export function SetaMais({
  visivel,
  onClick,
  rotulo = "Ver o que está abaixo",
  className,
}: {
  visivel: boolean;
  onClick: () => void;
  rotulo?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-slot="seta-mais"
      data-visivel={visivel ? "sim" : "nao"}
      tabIndex={-1}
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
      className={cn(
        // Fica na borda de baixo da área, centrada, por cima do conteúdo que
        // está se dissolvendo.
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2",
        "flex h-7 w-7 items-center justify-center rounded-full",
        "border border-line bg-raised text-ink-2 shadow-[var(--panel-shadow)]",
        "transition-opacity hover:text-ink",
        // Sem conteúdo escondido ela não existe: `opacity` mais
        // `pointer-events`, para não virar alvo invisível de clique.
        visivel ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      <ChevronDown size={15} />
    </button>
  );
}

/** Rola a área até o fim, com animação. Usado pelo clique da `SetaMais`. */
export function rolarAteOFim(el: HTMLElement | null) {
  el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}

/**
 * Uma área rolável que já nasce com a regra.
 *
 * ⚠️ É ISTO que deve ser usado, e não o hook direto, salvo quando quem chama
 * precisa do `temMais` para outra coisa. Dois motivos, e o segundo é o que
 * decide: um `div` com `overflow-y-auto` vira área rolável da casa trocando o
 * nome da tag, sem tocar em classe nem em layout; e **componente funciona dentro
 * de `map`**, onde um hook não funciona (a coluna do funil é uma por estágio, e
 * chamar o hook ali seria hook em laço).
 *
 * `overflow-y-auto` já vem embutido: uma "área rolável" que não rola é um nome
 * mentindo, e deixar isso para quem chama é o tipo de detalhe que alguém esquece
 * e só aparece no dia em que a lista cresce.
 */
export function AreaRolavel({
  tamanho = DISSOLVER_PADRAO,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** O degrau de dissolução. Escolhido pela ALTURA DO ITEM desta área. */
  tamanho?: number | false;
}) {
  // ⚠️ DESESTRUTURADO, e não `dissolver.style`: o objeto devolvido pelo hook
  // carrega um `ref` dentro, e a regra `react-hooks/refs` trata qualquer leitura
  // de propriedade dele durante o render como leitura de ref. Separar os campos
  // diz ao lint (e a quem lê) que `style` é valor, não ref.
  const { ref, style, onScroll } = useDissolverRolagem<HTMLDivElement>(
    tamanho,
    [children]
  );
  return (
    <div
      data-slot="area-rolavel"
      {...props}
      ref={ref}
      style={{ ...style, ...props.style }}
      onScroll={(e) => {
        onScroll(e);
        props.onScroll?.(e);
      }}
      className={cn("overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}
