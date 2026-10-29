// NOVIDADES (27/10/2026, dono): o que mudou no produto, mostrado UMA vez por
// usuário num diálogo ao entrar (`components/NovidadesModal.tsx`, no layout de
// `app/(app)`). Só para empresas que JÁ EXISTIAM antes da nota: quem chega
// depois começa com o produto como ele é, e não tem "o que mudou" para ler.
//
// Módulo PURO (sem I/O). A nota mora aqui, no repo, e entra junto com a entrega
// que ela descreve. "Já vi" mora no usuário (`user_metadata.novidades_vista`,
// o `id` da última nota fechada), gravado pelo navegador ao fechar.
//
// Texto de nota: português simples, voz da OBS, sem travessão, nenhum emoji além
// de 🚀. Nunca prometer o que o produto não faz (o texto passa pelo dono).

export interface Novidade {
  /** O dia da nota em São Paulo, AAAA-MM-DD. É também o id gravado no usuário. */
  id: string;
  titulo: string;
  /** Uma frase sob o título (opcional: a nota da Agenda não tem). */
  resumo?: string;
  /**
   * Cada novidade: um título curto e UMA linha (o diálogo é de leitura rápida),
   * ou só a frase, sem título (a nota da Agenda, como o dono aprovou).
   */
  itens: { titulo?: string; texto: string }[];
  /**
   * Um botão que leva a uma tela (além do "Entendi"). `soDono`: a tela é do dono
   * e o atendente seria mandado de volta, então ele não vê o botão.
   */
  acao?: { rotulo: string; href: string; soDono: boolean };
}

/** A chave em `user_metadata` com o id da última nota que o usuário fechou. */
export const CHAVE_DA_NOVIDADE_VISTA = "novidades_vista";

/** Mais recente primeiro. Só a primeira é mostrada. */
export const NOVIDADES: Novidade[] = [
  {
    // A Agenda (texto aprovado pelo dono em 29/10/2026, "Aprovo"; o `id` é o dia do deploy).
    id: "2026-10-29",
    titulo: "Agenda chegou",
    itens: [
      { texto: "A IA marca, remarca e cancela horários pela conversa, no horário que você definir." },
      { texto: "Lembrete automático no dia anterior, pedindo a confirmação do cliente." },
      { texto: "Veja a semana inteira e marque horários você mesmo, em Agenda." },
    ],
    acao: { rotulo: "Ativar a agenda", href: "/agenda/configuracoes", soDono: true },
  },
  {
    // Aprovada pelo dono e publicada em 27/10/2026 (o `id` é o dia do deploy).
    id: "2026-10-27",
    titulo: "Novidades no seu atendimento",
    resumo: "Vale para o que chegar a partir de agora.",
    itens: [
      {
        titulo: "A IA entende áudio",
        texto: "Ela ouve o cliente e responde, sem pedir para escrever.",
      },
      {
        titulo: "A IA vê fotos",
        texto: "Ela entende o que tem na imagem e segue a conversa.",
      },
      {
        titulo: "Arquivos guardados",
        texto: "Imagens e documentos ficam em Arquivos, na ficha do contato.",
      },
    ],
  },
];

/** A nota mais recente, ou `null` sem nenhuma. */
export function notaAtual(lista: Novidade[] = NOVIDADES): Novidade | null {
  return lista[0] ?? null;
}

/**
 * A nota que este usuário deve ver agora, ou `null`.
 *
 * - A empresa precisa ter sido criada ANTES do dia da nota (`inicioDoDia`, o
 *   instante de 00h em São Paulo do `id`, que quem chama calcula com
 *   `inicioDoDiaSP`). Conta nova não vê: para ela nada mudou.
 * - O usuário não pode já ter fechado esta nota (ou uma mais nova): `vista` é o
 *   id gravado, e ids são datas, então comparar texto é comparar dias.
 * - Nota do futuro (id depois de hoje) ainda não vale.
 */
export function novidadeParaMostrar(a: {
  nota: Novidade | null;
  /** `clients.created_at` da empresa do usuário. */
  empresaCriadaEm: string | null;
  /** `user_metadata.novidades_vista`. */
  vista: unknown;
  /** 00h em São Paulo do dia da nota, em ms. */
  inicioDoDia: number;
  agora: number;
}): Novidade | null {
  const { nota } = a;
  if (!nota) return null;
  if (a.agora < a.inicioDoDia) return null;
  if (typeof a.vista === "string" && a.vista >= nota.id) return null;
  const criada = a.empresaCriadaEm ? Date.parse(a.empresaCriadaEm) : NaN;
  if (!Number.isFinite(criada) || criada >= a.inicioDoDia) return null;
  return nota;
}
