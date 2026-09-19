/**
 * Fundo de rede neural da área de mensagens (19/09/2026).
 *
 * O dono gerou um esboço (`docs/esbocos/fundo-rede-neural.webp`): uma rede de nós
 * ligados por fios, com ícones do domínio dentro de alguns nós (robô, balão,
 * etiqueta, funil, cérebro, gráfico, raio, check). Ele pediu **só atrás das
 * mensagens, bem discreto, nos dois temas**, e disse que aceita ideia melhor.
 *
 * ⚠️ SVG DESENHADO EM `currentColor`, e nunca imagem rasterizada. Duas razões, e
 * as duas são regra da casa: um PNG não vira com o tema (o esboço é azul-acinzentado
 * sobre branco e sumiria ou brilharia no escuro), e um raster pesaria no bundle
 * para servir de textura de 6%. Aqui o tema entra por UM token de força
 * (`--rede-forca`) e a cor é a da marca, herdada por `color`.
 *
 * ⚠️ E É `<pattern>`, não `background-image` com data URI. Data URI não lê
 * variável de CSS, então a alternativa seria repetir o SVG inteiro dentro do
 * `globals.css`, uma vez por tema, e manter as duas cópias em sincronia à mão.
 * Com `<pattern>` existe um desenho só.
 *
 * ⚠️ O FUNDO NÃO ROLA. Ele é absoluto no contêiner da conversa, irmão do
 * ScrollArea e não filho do viewport, então o conteúdo passa por cima dele. Um
 * padrão que anda junto com a rolagem chama atenção, e a regra do dono é
 * discrição.
 *
 * ⚠️ O CONTRASTE DO BALÃO VENCE O FUNDO, e isso é garantido por CONSTRUÇÃO e não
 * por calibragem: todo balão tem fundo OPACO (`--bubble-in-bg`, `--bubble-ia-bg`,
 * `--bubble-you-bg`), então o padrão nunca fica atrás de texto. O que ele pinta é
 * só o vão entre balões.
 *
 * O ladrilho fecha nas bordas: as linhas que saem por um lado entram pelo lado
 * oposto na mesma coordenada, senão a repetição vira uma grade visível de
 * retângulos.
 */
export default function FundoRede() {
  return (
    // ⚠️ A textura tem a largura da COLUNA DE LEITURA (960px, a mesma da
    // conversa), e não a do cartão. Segunda rodada de 19/09: em tela larga com
    // as duas colunas fechadas sobram centenas de pixels de superfície vazia dos
    // dois lados, e ali a textura não fica ATRÁS de nada, ela fica SOZINHA na
    // tela. O dono chamou isso de "as laterais estão ruins", e ele tem razão:
    // fundo é o que passa por trás do conteúdo, e onde não há conteúdo é só
    // sujeira. A dissolução das bordas mora no `.fundo-rede` (globals.css).
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden"
    >
      <svg
        data-slot="fundo-rede"
        className="fundo-rede h-full w-full max-w-[960px]"
      >
        <defs>
          <pattern
            id="rede-neural"
            width="340"
            height="340"
            patternUnits="userSpaceOnUse"
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Os FIOS. Os quatro últimos atravessam a borda e têm o par no lado
                oposto, na mesma coordenada, para o ladrilho não marcar. */}
              <path d="M62 58 196 96 258 212 200 300 48 268 118 178Z" />
              <path d="M118 178 62 58" />
              <path d="M196 96 118 178" />
              <path d="M258 212 320 180" />
              <path d="M258 212 340 168" />
              <path d="M0 168 24 196 48 268" />
              <path d="M200 300 232 340" />
              <path d="M232 0 196 96" />

              {/* Os NÓS com ícone. Círculo de 14 e um glifo simplificado dentro:
                a esta força, desenho mais detalhado vira borrão. */}
              {/* Robô */}
              <circle cx="62" cy="58" r="14" />
              <rect x="55" y="53" width="14" height="11" rx="3" />
              <path d="M62 49v4M58.5 57.5h.01M65.5 57.5h.01" />

              {/* Balão de conversa */}
              <circle cx="196" cy="96" r="14" />
              <path d="M189 91h14v9h-8l-4 4v-4h-2z" />

              {/* Etiqueta */}
              <circle cx="118" cy="178" r="14" />
              <path d="M112 178l6-6h6v6l-6 6z" />
              <path d="M121 175h.01" />

              {/* Cérebro, reduzido a dois lobos */}
              <circle cx="258" cy="212" r="14" />
              <path d="M258 206v12M258 206a4 4 0 00-6 3 3 3 0 000 6 4 4 0 006 3M258 206a4 4 0 016 3 3 3 0 010 6 4 4 0 01-6 3" />

              {/* Raio */}
              <circle cx="48" cy="268" r="14" />
              <path d="M50 261l-5 8h6l-5 8" />

              {/* Check */}
              <circle cx="200" cy="300" r="14" />
              <path d="M194 300l4 4 8-8" />

              {/* Gráfico */}
              <circle cx="320" cy="180" r="14" />
              <path d="M315 185v-4M320 185v-8M325 185v-6" />

              {/* Funil */}
              <circle cx="232" cy="26" r="14" />
              <path d="M226 21h12l-5 6v5l-2-2v-3z" />

              {/* Os PONTOS soltos: é o que faz a rede parecer rede, e não um
                polígono. Pequenos e sem contorno. */}
              <g fill="currentColor" stroke="none">
                <circle cx="150" cy="36" r="2" />
                <circle cx="86" cy="120" r="1.5" />
                <circle cx="250" cy="140" r="2" />
                <circle cx="24" cy="196" r="2" />
                <circle cx="168" cy="242" r="1.5" />
                <circle cx="300" cy="268" r="2" />
                <circle cx="120" cy="318" r="1.5" />
                <circle cx="60" cy="330" r="2" />
                <circle cx="286" cy="94" r="1.5" />
                <circle cx="140" cy="140" r="1.5" />
              </g>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#rede-neural)" />
      </svg>
    </div>
  );
}
