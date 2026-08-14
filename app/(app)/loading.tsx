// Fallback de navegação entre páginas do app (Suspense boundary do route group).
// Aparece na hora do clique enquanto a rota renderiza no servidor, então a
// troca de página responde na hora em vez de "congelar". Some sozinho quando a
// página fica pronta. Esqueleto neutro (serve pra qualquer página).
export default function Loading() {
  return (
    <div className="glass flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl p-6">
      <div className="h-6 w-40 animate-pulse rounded bg-panel" />
      <div className="h-4 w-64 animate-pulse rounded bg-panel/70" />
      <div className="mt-4 flex-1 animate-pulse rounded-xl bg-panel/50" />
    </div>
  );
}
