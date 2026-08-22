// Fallback ao trocar de conversa (Suspense do segmento [id]). A lista fica (é do
// layout do inbox); só a área da conversa mostra este esqueleto enquanto o
// servidor carrega as mensagens. Some quando a conversa fica pronta.
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* cabeçalho */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--chip-bg)]" />
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--chip-bg)]" />
      </div>
      {/* mensagens */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
            <div
              className={`h-10 animate-pulse rounded-xl bg-[var(--chip-bg)] ${
                i % 2 ? "w-52" : "w-60"
              }`}
            />
          </div>
        ))}
      </div>
      {/* composer */}
      <div className="border-t border-line p-3">
        <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--chip-bg)]" />
      </div>
    </div>
  );
}
