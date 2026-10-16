import { usdCurto } from "./custo-ia";
import { diaIsoSP, somarDias } from "./fuso";

// COTAÇÃO DO DÓLAR PARA OS CUSTOS DA CENTRAL (decisão do dono, 16/10/2026): a PTAX de VENDA do
// Banco Central do Brasil, o fechamento do dia útil mais recente. A URL e a leitura da resposta são puras (aqui); a busca
// com cache fica em `lib/cambio-servidor.ts`.
//
// Fonte: API de dados abertos do BCB, serviço PTAX (Olinda), função `CotacaoDolarPeriodo`
// (parâmetros `dataInicial` e `dataFinalCotacao`, datas no formato `'MM-DD-AAAA'`), que devolve UMA
// cotação por dia útil (o boletim de fechamento, ~13h05) com `cotacaoCompra`, `cotacaoVenda` e
// `dataHoraCotacao`. Conferido contra o `$metadata` do serviço em 16/10/2026:
// https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/$metadata
// Documentação: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/documentacao
//
// Pede os últimos 10 dias e fica com o mais recente: sábado, domingo e feriado não têm PTAX.
// Cache de 6 horas por URL (na busca): a URL leva a data de hoje, então vira outra a cada dia, e a cotação
// do dia, que sai por volta das 13h05, entra na leitura seguinte. Falha de rede, resposta torta ou sem
// cotação: `null`, e a tela diz que a cotação está indisponível e mostra US$ (nunca uma taxa inventada).
//
// Os formatos de tela do custo em reais (`custoCurto`, `notaDoCambio`) moram aqui também: `lib/custo-ia.ts`
// fica com preços, tetos e consumo.

/**
 * A cotação do dólar com que a central mostra o custo em REAIS: a PTAX de venda do Banco Central do
 * Brasil (fechamento do dia útil mais recente). `data` é o dia da cotação (`AAAA-MM-DD`). Quem busca
 * (`lib/cambio-servidor.ts`, só no servidor) devolve `null` quando não consegue: nunca uma taxa inventada.
 */
export interface Cambio {
  taxa: number;
  data: string;
}

const FMT_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function cambioValido(v: unknown): v is Cambio {
  const c = v as Cambio | null;
  return !!c && typeof c.taxa === "number" && Number.isFinite(c.taxa) && c.taxa > 0 && /^\d{4}-\d{2}-\d{2}$/.test(c.data);
}

/** O custo em US$ convertido para reais pela taxa (sem arredondar antes). */
export function usdParaReais(usd: number, cambio: Cambio): number {
  return usd * cambio.taxa;
}

/**
 * O custo como a central escreve: "R$ 4,12" quando há cotação, "US$ 0,83" quando não há (o texto da
 * nota diz que a cotação está indisponível). Abaixo de um centavo, "menos de ...". Sem preço do modelo, null.
 */
export function custoCurto(usd: number | null, cambio: Cambio | null): string | null {
  if (usd == null) return null;
  if (!cambio) return usdCurto(usd);
  const v = usdParaReais(usd, cambio);
  if (v > 0 && v < 0.01) return `menos de ${FMT_BRL.format(0.01)}`;
  return FMT_BRL.format(v);
}

/** O custo de um ponto de gráfico na moeda da tela: reais com cotação, dólares sem. */
export function custoNaMoeda(usd: number, cambio: Cambio | null): number {
  return cambio ? usdParaReais(usd, cambio) : usd;
}

/** Um valor de `custoNaMoeda` escrito com a moeda ("R$ 4,22" ou "US$ 4,22"): o balão do mini gráfico de custo. */
export function custoDoPonto(valor: number, cambio: Cambio | null): string {
  return custoCurto(cambio ? valor / cambio.taxa : valor, cambio) ?? "";
}

/** A nota sobre a moeda dos custos: a cotação usada, o aviso de que ela está sendo buscada, ou de que está indisponível. */
export function notaDoCambio(cambio: Cambio | null, buscando = false): string {
  if (!cambio && buscando) return "Buscando a cotação do dólar: por enquanto os custos aparecem em US$.";
  if (!cambio) return "Cotação do dólar indisponível agora: os custos aparecem em US$.";
  const [a, m, d] = cambio.data.split("-");
  return `Custos em reais pela PTAX de venda do Banco Central de ${d}/${m}/${a}: R$ ${cambio.taxa.toFixed(4).replace(".", ",")} por US$ 1.`;
}

const BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo";
const DIAS_PARA_TRAS = 10;

/** `AAAA-MM-DD` vira o `'MM-DD-AAAA'` que a API do BCB espera. */
export function dataParaOlinda(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${m}-${d}-${a}`;
}

/** A URL da consulta: os últimos dias até hoje, o mais recente primeiro, só os campos usados. */
export function urlDaPtax(agora: number): string {
  const hoje = diaIsoSP(agora);
  const de = somarDias(hoje, -DIAS_PARA_TRAS);
  // Escrita à mão (nada de URLSearchParams): o Olinda recusa o `+` no lugar do espaço do `$orderby`.
  const consulta =
    `@dataInicial='${dataParaOlinda(de)}'&@dataFinalCotacao='${dataParaOlinda(hoje)}'` +
    "&$orderby=dataHoraCotacao%20desc&$top=1&$format=json&$select=cotacaoVenda,dataHoraCotacao";
  return `${BASE}(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${consulta}`;
}

/** A resposta da API vira a cotação; qualquer formato diferente do documentado é `null`. */
export function cambioDaResposta(corpo: unknown): Cambio | null {
  const valor = (corpo as { value?: unknown } | null)?.value;
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const linha = valor[0] as { cotacaoVenda?: unknown; dataHoraCotacao?: unknown };
  const taxa = Number(linha.cotacaoVenda);
  const data = typeof linha.dataHoraCotacao === "string" ? linha.dataHoraCotacao.slice(0, 10) : "";
  const cambio = { taxa, data };
  return cambioValido(cambio) ? cambio : null;
}
