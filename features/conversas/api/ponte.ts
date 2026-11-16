import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import type { SessaoDoApp } from "@/lib/sessao";
import { chavesDeConversas } from "./chaves";

/** Uma rajada (4 mensagens e a resposta) vira UMA busca por conversa, depois de 500 ms parado (o de antes). */
const ATRASO_DA_LISTA_MS = 500;

/**
 * A PONTE DE CONVERSAS (lib/realtime/PonteDoRealtime.tsx): assinada UMA vez, no layout
 * do `(app)`, no canal do tenant. O evento só anota QUAL conversa mudou; a busca é da
 * linha (`sincronizar.ts`). Montada no layout, uma mensagem que chega com a pessoa em
 * outra tela deixa a lista guardada marcada como velha, e não "fresca" com dado antigo.
 * `modo: "buscar"` (o padrão): aba escondida não lê, revalida ao voltar.
 */
export function usePonteDeConversas(sessao: SessaoDoApp): void {
  const qc = useQueryClient();
  const pendentes = useRef(new Set<string>());
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );
  useCanalTenant({
    clientId: sessao.clientId,
    tabelas: ["conversations", "dados_cliente", "conversation_qualifications"],
    aoEvento: (ev) => {
      const fone = foneDoEvento(ev);
      if (!fone) return;
      pendentes.current.add(fone);
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = setTimeout(() => {
        const fones = [...pendentes.current];
        pendentes.current.clear();
        // Sem lista guardada (a pessoa não abriu Conversas nesta aba) não há o que encaixar.
        if (qc.getQueryCache().findAll({ queryKey: chavesDeConversas.listas() }).length === 0) {
          void qc.invalidateQueries({ queryKey: chavesDeConversas.contagens() });
          return;
        }
        // A fonte e a regra de encaixe só chegam no primeiro evento (B8).
        void Promise.all([import("./sincronizar"), import("./navegador")]).then(([s, n]) =>
          s.encaixarConversas(qc, n.fonteDeConversasDoNavegador(sessao.clientId), { eu: sessao.userId, avisos: sessao.avisos }, fones),
        );
      }, ATRASO_DA_LISTA_MS);
    },
    revalidar: () => void import("./sincronizar").then((s) => s.revalidarConversas(qc)),
  });
}
