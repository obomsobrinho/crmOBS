"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Importa a base existente (contatos + histórico) caso o tenant esteja
// conectado mas ainda não tenha importado. Roda uma vez; o servidor é
// idempotente (clients.imported_at), então re-disparos são inofensivos.
export default function AutoImport({ clientId }: { clientId: string }) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setImporting(true);
    (async () => {
      try {
        await fetch(`/api/clients/${clientId}/import`, { method: "POST" });
        router.refresh();
      } catch {
        // silencioso; segue sem o histórico
      } finally {
        setImporting(false);
      }
    })();
  }, [clientId, router]);

  if (!importing) return null;

  return (
    <div className="rounded-xl border border-warn-line bg-warn-surface px-4 py-2 text-legenda font-medium text-warn-ink">
      Importando contatos e conversas do WhatsApp…
    </div>
  );
}
