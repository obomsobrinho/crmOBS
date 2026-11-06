// O foguete da casa, em SVG e sem imagem: o mesmo desenho do topo das Novidades e
// do painel da entrada. Mora dentro de um `<svg>` de quem usa, porque cada um
// compõe a sua cena; o rastro lê um degradê que quem usa declara em `<defs>`
// (`RastroDoFoguete`), já que um id repetido na página pintaria o degradê errado.

export function RastroDoFoguete({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style={{ stopColor: "var(--brand-on)", stopOpacity: 0.9 }} />
      <stop offset="1" style={{ stopColor: "var(--brand-on)", stopOpacity: 0 }} />
    </linearGradient>
  );
}

/** Desenhado em x 160 a 224 e y 34 a 170, com o rastro. */
export function DesenhoDoFoguete({ idDoRastro }: { idDoRastro: string }) {
  return (
    <g className="anim-foguete">
      <rect x="185" y="118" width="14" height="52" rx="7" fill={`url(#${idDoRastro})`} />
      <path
        d="M192 34c13 10 19 28 19 50v34h-38V84c0-22 6-40 19-50z"
        style={{ fill: "var(--brand-on)" }}
      />
      <path d="M173 94l-13 17v12l13-6z" style={{ fill: "var(--brand-on)" }} fillOpacity="0.85" />
      <path d="M211 94l13 17v12l-13-6z" style={{ fill: "var(--brand-on)" }} fillOpacity="0.85" />
      <circle cx="192" cy="74" r="10" style={{ fill: "var(--brand-grad-end)", stroke: "var(--brand-fill)" }} strokeWidth="3" />
      <rect x="181" y="118" width="22" height="6" rx="3" style={{ fill: "var(--brand-on)" }} fillOpacity="0.7" />
    </g>
  );
}
