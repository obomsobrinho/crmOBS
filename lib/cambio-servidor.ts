import "server-only";
import { cambioDaResposta, urlDaPtax, type Cambio } from "./cambio";

// A busca da cotação PTAX (só no servidor; a URL e a leitura da resposta moram em `lib/cambio.ts`, puro).
//
// A página NUNCA espera por ela: quem chama passa a PROMESSA ao navegador (`useCambio`, `lib/use-cambio.ts`), que
// mostra US$ de saída e troca para reais quando a cotação chega. Aqui só se limita o estrago de uma fonte lenta:
// um tempo curto, a mesma busca compartilhada entre chamadas ao mesmo tempo, e a FALHA lembrada por alguns
// minutos (sem isso, cada abertura da central pagava de novo o tempo todo contra uma fonte fora do ar).
const SEIS_HORAS = 6 * 60 * 60;
const TEMPO_MAXIMO_MS = 2_000;
/** Quanto tempo uma falha vale antes de tentar a fonte de novo. */
const FALHA_LEMBRADA_MS = 10 * 60 * 1000;

let falhouEm = 0;
let emAndamento: { url: string; busca: Promise<Cambio | null> } | null = null;

function lembrarFalha(motivo: string): null {
  falhouEm = Date.now();
  console.error("cotação PTAX indisponível:", motivo);
  return null;
}

async function buscar(url: string): Promise<Cambio | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: SEIS_HORAS },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!res.ok) return lembrarFalha(`resposta ${res.status}`);
    const cambio = cambioDaResposta(await res.json());
    return cambio ?? lembrarFalha("resposta sem cotação");
  } catch (e) {
    return lembrarFalha(e instanceof Error ? e.message : String(e));
  }
}

/**
 * A PTAX de venda mais recente, ou `null` quando não deu para ler (nunca uma taxa inventada). Uma resposta boa
 * fica no Data Cache do Next por 6 horas; uma falha fica lembrada por 10 minutos. Nunca lança.
 */
export function cotacaoPtax(agora: number): Promise<Cambio | null> {
  if (Date.now() - falhouEm < FALHA_LEMBRADA_MS) return Promise.resolve(null);
  const url = urlDaPtax(agora);
  if (emAndamento?.url === url) return emAndamento.busca;
  const busca = buscar(url).finally(() => {
    if (emAndamento?.busca === busca) emAndamento = null;
  });
  emAndamento = { url, busca };
  return busca;
}
