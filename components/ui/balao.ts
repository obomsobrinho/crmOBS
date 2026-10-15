/**
 * A moldura do balão de valor (tooltip de gráfico): a mesma do balão do painel
 * (`painel-balao`): superfície `raised`, borda `line-strong`, sombra do painel,
 * texto de legenda. Um módulo à parte, sem o Recharts, para o mapa de calor e o
 * gráfico usarem a MESMA moldura sem o mapa puxar a biblioteca inteira.
 */
export const MOLDURA_DO_BALAO =
  "grid min-w-36 gap-1 rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-legenda text-ink shadow-[var(--panel-shadow)]";
