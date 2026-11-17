import { useCallback, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CONTAGENS_VAZIAS, PAGINA_INBOX, cursorDe, type Contagens } from "@/lib/inbox-lista";
import type { JanelaKey } from "@/lib/inbox";
import { agoraMs } from "@/lib/periodo";
import { FRESCO_CONFIG_MS } from "@/lib/query/cliente";
import type { Member } from "@/lib/team";
import { chavesDeConversas, paramsDoRecorte, type ListaNoCache, type QuemLe, type RecorteDaLista } from "../api/chaves";
import type { AberturaDaConversa } from "../api/conversa";
import type { FonteInbox } from "../api/fonte";

// OS DADOS DA LISTA DE CONVERSAS (passo 4 de docs/plano-dados-e-estado.md): a única
// porta da tela para os dados. A lista guarda as linhas carregadas numa chave por
// recorte; o realtime encaixa linha a linha na mesma chave (`api/sincronizar.ts`).

/** Quantas linhas uma releitura pede: as que já estão na tela (até 50), nunca menos de uma página. */
function quantasReler(atual: ListaNoCache | undefined): number {
  return Math.min(50, Math.max(PAGINA_INBOX, atual?.itens.length ?? 0));
}

/**
 * A lista de um recorte. Reler (foco, reconexão, lista velha) busca de novo as N
 * primeiras linhas que já estão na tela, sem jogar a rolagem fora; trocar de recorte
 * mantém o anterior na tela até o novo chegar. `inicial` é só do preview `/design`.
 */
export function useListaDeConversas(fonte: FonteInbox, quem: QuemLe, recorte: RecorteDaLista, inicial?: ListaNoCache) {
  const qc = useQueryClient();
  const chave = chavesDeConversas.lista(recorte);
  const q = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<ListaNoCache> => {
      const n = quantasReler(qc.getQueryData<ListaNoCache>(chave));
      const itens = await fonte.pagina(paramsDoRecorte(recorte, quem, agoraMs()), null, n);
      return { itens, temMais: itens.length === n };
    },
    initialData: inicial,
    placeholderData: keepPreviousData,
  });

  const buscandoMais = useRef(false);
  const [maisEmCurso, setMaisEmCurso] = useState(false);
  const carregarMais = useCallback(async () => {
    const atual = qc.getQueryData<ListaNoCache>(chave);
    if (!atual || !atual.temMais || atual.itens.length === 0 || buscandoMais.current) return;
    buscandoMais.current = true;
    setMaisEmCurso(true);
    try {
      const pagina = await fonte.pagina(paramsDoRecorte(recorte, quem, agoraMs()), cursorDe(atual.itens[atual.itens.length - 1]));
      qc.setQueryData<ListaNoCache>(chave, (cur) => {
        if (!cur) return cur;
        const vistos = new Set(cur.itens.map((i) => i.phone));
        return { itens: [...cur.itens, ...pagina.filter((i) => !vistos.has(i.phone))], temMais: pagina.length === PAGINA_INBOX };
      });
    } catch (e) {
      console.error("mais conversas:", e);
    } finally {
      buscandoMais.current = false;
      setMaisEmCurso(false);
    }
    // `chave` muda de identidade a cada render; o recorte é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, fonte, quem, recorte.janela, recorte.filtro, recorte.busca]);

  return {
    itens: q.data?.itens ?? [],
    temMais: q.data?.temMais ?? false,
    /** Ainda sem nenhum dado (nem o do recorte anterior): a tela mostra a moldura. */
    semDados: q.data === undefined,
    carregando: q.isFetching || maisEmCurso,
    carregarMais,
  };
}

/** Os números dos chips e dos grupos, pela janela (a busca e o filtro não mudam os números). */
export function useContagensDeConversas(fonte: FonteInbox, quem: QuemLe, janela: JanelaKey, inicial?: Contagens): Contagens {
  const q = useQuery({
    queryKey: chavesDeConversas.contagensDa(janela),
    queryFn: () => {
      const p = paramsDoRecorte({ janela, filtro: "all", busca: "" }, quem, agoraMs());
      return fonte.contagens({ inicio: p.inicio, eu: p.eu, fora: p.fora });
    },
    initialData: inicial,
    placeholderData: keepPreviousData,
  });
  return q.data ?? CONTAGENS_VAZIAS;
}

/** A equipe, para nomear quem atende; muda raramente. Sem leitor (preview), fica vazia. */
export function useEquipeDeConversas(ler: (() => Promise<Member[]>) | null): Record<string, Member> {
  const q = useQuery({
    queryKey: chavesDeConversas.equipe(),
    queryFn: async () => Object.fromEntries((await ler!()).map((m) => [m.userId, m])),
    enabled: ler !== null,
    staleTime: FRESCO_CONFIG_MS,
  });
  return q.data ?? {};
}

/**
 * A abertura de uma conversa: lida a cada vez que a conversa abre (nada guardado depois
 * de sair) e nunca relida sozinha, porque dali em diante quem mantém as mensagens é o
 * canal da própria conversa. `null` = a conversa não existe.
 */
export function useAberturaDaConversa(phone: string, ler: (phone: string) => Promise<AberturaDaConversa | null>) {
  return useQuery({
    queryKey: chavesDeConversas.abertura(phone),
    queryFn: () => ler(phone),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
