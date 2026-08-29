// As três regras novas do painel redesenhado, num módulo só.
//
// Puro (só importa outros módulos puros), pelo mesmo motivo de lib/valor.ts e
// lib/mensagem.ts: servidor calcula, browser desenha, /design renderiza sem
// banco, e ninguém tem uma segunda opinião sobre o mesmo número.
//
// Os dois LIMIARES da tela moram aqui em cima, nomeados, porque os dois vieram
// de fora do produto (um da ferramenta de desenho, outro de escolha minha) e o
// dono precisa trocar cada um num lugar só.

import { dentroDoHorario, parteLocal } from "@/lib/valor";
import { respostaDaIa, respostaHumana } from "@/lib/mensagem";
import { renderHours, type BusinessHours } from "@/lib/agent-prompt";

// ---------------------------------------------------------------------------
// Limiares
// ---------------------------------------------------------------------------

/**
 * A partir de quanto tempo de espera a linha da fila deixa de ser neutra e vira
 * aviso (âmbar).
 *
 * ⚠️ 2 horas veio da ferramenta de DESENHO, não do dono do produto. Está aqui
 * como constante justamente para ser uma edição só quando ele decidir outro
 * número. Nada mais no código pode repetir esse valor.
 */
export const ESPERA_AVISO_MS = 2 * 60 * 60 * 1000;

/**
 * Tamanho mínimo, em caracteres, para uma resposta poder virar o verbatim do
 * painel quando nenhuma conversa atendida só pela IA se qualifica.
 *
 * ⚠️ ESTE NÚMERO NÃO VEIO DO DONO nem do material de desenho: escolhi 120 e o
 * relatório diz isso. O critério foi cortar as frases de fechamento, que é o
 * defeito que motivou a mudança de regra ("Perfeito, até amanhã!" tem 21
 * caracteres e não prova nada), sem exigir tanto texto que uma conta nova fique
 * sem nenhuma resposta para mostrar. Se o dono quiser mais rigor, sobe aqui.
 */
export const VERBATIM_MIN_CHARS = 120;

// ---------------------------------------------------------------------------
// Gráfico de hora da manchete
// ---------------------------------------------------------------------------

export interface BarraHora {
  /** 0 a 23, em America/Sao_Paulo. */
  hora: number;
  /** Respostas da IA com a empresa ABERTA. */
  dentro: number;
  /** Respostas da IA com a empresa FECHADA (inclui fim de semana e feriado). */
  fora: number;
}

export interface HorasInput {
  /** Linhas de chat_messages JÁ recortadas para a janela da manchete. */
  msgs: {
    bot_message: string | null;
    message_type: string | null;
    created_at: string;
  }[];
  /** Horário declarado da empresa. Sem ele não existe dentro nem fora. */
  hours: BusinessHours | null;
}

/**
 * As 24 colunas do gráfico da manchete.
 *
 * ⚠️ ESTA FUNÇÃO CONTA RESPOSTA DA IA, NÃO MENSAGEM RECEBIDA, e a diferença é o
 * ponto inteiro do gráfico. A manchete diz "N mensagens respondidas fora do
 * horário", e esse N é `atendidasForaDoHorario` do lib/valor.ts, que conta
 * exatamente as linhas em que `respostaDaIa` é verdadeiro e `dentroDoHorario` é
 * falso. Contar chegadas daria um conjunto DIFERENTE: uma mensagem que chegou às
 * 23h e o time respondeu no dia seguinte entraria no gráfico e não na manchete,
 * e a soma das partes roxas deixaria de fechar.
 *
 * A soma de `fora` sobre as 24 colunas é, por construção, igual ao número da
 * manchete. Existe teste para essa igualdade, porque o cliente confere no
 * WhatsApp dele e uma divergência ali derruba a credibilidade da tela inteira.
 *
 * ⚠️ Dentro ou fora considera o DIA DA SEMANA, não só a hora: 14h de um domingo
 * é fora, para uma empresa que não abre domingo. Quem decide é `dentroDoHorario`,
 * a mesma função que a manchete usa.
 */
export function barrasDeHora(input: HorasInput): BarraHora[] {
  const colunas: BarraHora[] = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    dentro: 0,
    fora: 0,
  }));
  if (!input.hours) return colunas;

  for (const m of input.msgs) {
    if (!respostaDaIa(m)) continue;
    const p = parteLocal(m.created_at);
    if (!p) continue;
    const c = colunas[p.hora];
    if (dentroDoHorario(p, input.hours)) c.dentro++;
    else c.fora++;
  }
  return colunas;
}

/** Soma das partes de fora. É o número que tem que bater com a manchete. */
export function totalFora(colunas: BarraHora[]): number {
  return colunas.reduce((s, c) => s + c.fora, 0);
}

/** Soma das duas partes. Vai na legenda do gráfico. */
export function totalRespostas(colunas: BarraHora[]): number {
  return colunas.reduce((s, c) => s + c.dentro + c.fora, 0);
}

/**
 * O horário da empresa em UMA linha, para a legenda do gráfico ("Segunda a
 * sexta: 08:00 às 18:00").
 *
 * Reaproveita `renderHours` de propósito, em vez de reescrever o agrupamento de
 * dias contíguos: aquela função já é a fonte de verdade do horário no prompt do
 * agente, e duas versões da mesma frase divergiriam na primeira empresa que
 * abrisse sábado com outro horário.
 *
 * A linha "Não atende" é descartada porque a legenda diz o DENTRO; o fora já
 * está dito pela outra metade da legenda, que inclui fim de semana e feriado.
 */
export function rotuloHorario(hours: BusinessHours | null): string {
  if (!hours) return "";
  return renderHours(hours)
    .split("\n")
    .filter((l) => l.startsWith("- ") && !l.startsWith("- Não atende"))
    .map((l) => l.slice(2))
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Verbatim: a última coisa que o agente respondeu
// ---------------------------------------------------------------------------

export interface CandidatoVerbatim {
  phone: string;
  nomewpp: string | null;
  /**
   * A pergunta do cliente.
   *
   * ⚠️ Vem na MESMA linha que a resposta: é assim que o n8n grava, uma linha com
   * `user_message` e `bot_message` juntos e UM `created_at`. É por isso que dá
   * para mostrar o par pergunta/resposta, e é pelo mesmo motivo que NÃO dá para
   * medir quanto tempo a IA levou: não existem dois instantes no dado.
   */
  user_message?: string | null;
  bot_message: string | null;
  message_type: string | null;
  created_at: string;
}

export interface Verbatim {
  /**
   * As mensagens do turno, já separadas.
   *
   * ⚠️ É um ARRAY e não uma string por causa de uma dívida conhecida do n8n: um
   * turno de duas mensagens é gravado numa linha só, unido por `" | "`. Thread,
   * sidebar, card do pipeline e a reconstrução de histórico já desfazem isso; o
   * painel não desfazia, e o resultado media na tela real da Loja Teste foi uma
   * citação com um pipe no meio, que é justamente o oposto de "veja como ela
   * fala de verdade".
   */
  mensagens: string[];
  /** A pergunta que gerou a resposta. `null` quando a linha não tem. */
  pergunta: string | null;
  phone: string;
  nomewpp: string | null;
  created_at: string;
  /** A conversa inteira correu sem ninguém do time responder. */
  sozinha: boolean;
}

/**
 * Desfaz o `"msg1 | msg2"` do armazenamento.
 *
 * Só separa quando o pipe está cercado de espaço, que é o formato exato que o
 * n8n grava: assim uma mensagem que contenha um pipe colado no texto ("A|B")
 * não é partida no meio.
 */
export function separarMensagens(texto: string): string[] {
  return texto
    .split(" | ")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Escolhe a resposta que aparece no painel, na íntegra.
 *
 * ⚠️ REGRA OBJETIVA, APLICADA SEMPRE, NUNCA UMA ESCOLHA A DEDO. Um dia isto vai
 * mostrar uma resposta ruim no topo do painel, e isso é o ponto: é o caminho
 * mais curto até o conserto. No dia em que o dono descobrisse que a gente
 * escolhia as boas, a perda de confiança seria permanente.
 *
 * A regra mudou em 29/08/2026. Era "a resposta mais recente da IA", e metade das
 * vezes caía em "Perfeito, até amanhã!", que não prova nada sobre o agente.
 * Agora, em ordem:
 *
 * 1. A mais recente de uma conversa que a IA atendeu SOZINHA (nenhuma resposta
 *    humana naquele telefone dentro do material examinado). É a que melhor
 *    representa o produto funcionando.
 * 2. Se nenhuma se qualifica, a mais recente com pelo menos
 *    `VERBATIM_MIN_CHARS` caracteres.
 * 3. Se nem isso, nada. O bloco some, em vez de mostrar uma despedida.
 *
 * ⚠️ "Sozinha" é medido sobre as linhas RECEBIDAS aqui, que são a janela que o
 * chamador leu. Uma resposta humana anterior a essa janela não é vista. É
 * limitação conhecida e aceitável: o material do painel é o acumulado com teto,
 * então na prática cobre a conta inteira.
 */
export function escolherVerbatim(
  candidatos: CandidatoVerbatim[]
): Verbatim | null {
  const comHumano = new Set<string>();
  for (const m of candidatos) {
    if (respostaHumana(m)) comHumano.add(m.phone);
  }

  const daIa = candidatos
    .filter((m) => respostaDaIa(m) && !!m.bot_message?.trim())
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const monta = (m: CandidatoVerbatim): Verbatim => ({
    mensagens: separarMensagens(m.bot_message as string),
    pergunta: m.user_message?.trim() || null,
    phone: m.phone,
    nomewpp: m.nomewpp,
    created_at: m.created_at,
    sozinha: !comHumano.has(m.phone),
  });

  const sozinha = daIa.find((m) => !comHumano.has(m.phone));
  if (sozinha) return monta(sozinha);

  const longa = daIa.find(
    (m) => (m.bot_message as string).trim().length >= VERBATIM_MIN_CHARS
  );
  return longa ? monta(longa) : null;
}
