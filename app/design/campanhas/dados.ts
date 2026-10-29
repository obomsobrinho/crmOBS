import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import { varianteDaOrdem } from "@/lib/prospeccao";
import {
  leadsDoFiltro,
  type Busca,
  type Campanha,
  type ConexaoDisponivel,
  type EnvioDaCampanha,
  type Lead,
} from "@/components/admin/campanhas/tipos";

// DADOS DE MENTIRA do preview de Campanhas (`/design/campanhas`). Empresas,
// telefones e respostas inventados: nada aqui existe, nada é enviado e nenhuma
// busca paga é chamada. Os celulares usam o prefixo 90000, para não coincidirem
// com um número de verdade; os sites terminam em `.exemplo`.

const MIN = 60_000;
const H = 60 * MIN;

/** As três variantes sugeridas no brief (o dono aprova antes de usar). */
export const VARIANTES_SUGERIDAS = [
  "Oi, tudo bem? Sou o Franck, da OBS. Achei a {empresa} numa busca no Google. A gente monta sistemas sob medida que deixam o WhatsApp respondendo sozinho e tiram o trabalho repetido da rotina. Posso te mostrar em 2 minutos como ficaria aí?",
  "Oi! Aqui é o Franck, da OBS. Vi a {empresa} no Google e fiquei curioso: quando um cliente chama no WhatsApp fora do horário, alguém responde? A gente monta um sistema que atende, organiza e agenda sozinho. Se fizer sentido, te mostro rapidinho.",
  "Oi, tudo bem? Sou o Franck, da OBS. A gente cria sistemas sob medida pra tirar tarefa chata da rotina: atendimento no WhatsApp que responde sozinho, agenda, lembrete, controle. Vale uma conversa rápida pra eu entender como funciona aí na {empresa} hoje?",
];

export const CONEXOES_DE_MENTIRA: ConexaoDisponivel[] = [
  { id: "obs", nome: "OBS", numero: "(33) 90000-0001", conectado: true },
  { id: "chip", nome: "OBS Prospecção", numero: "(33) 90000-0002", conectado: false },
];

/** Um sorteio repetível (mulberry32): o preview mostra sempre a mesma coisa. */
function sorteador(semente: number) {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Base = [nome: string, bairro: string, telefone: "cel" | "fixo" | "sem", site: string | null, nota: number | null, avaliacoes: number | null];

const ESTETICA: Base[] = [
  ["Espaço Bella Pele", "Centro", "cel", null, 4.9, 214],
  ["Clínica Renova Estética", "Centro", "cel", "renovaestetica.exemplo", 4.7, 132],
  ["Studio Corpo e Forma", "São Vicente", "cel", "instagram.com/corpoeforma", 4.8, 88],
  ["Lumière Estética Avançada", "Centro", "cel", null, 5.0, 41],
  ["Instituto Viva Bem", "Planalto", "fixo", "vivabem.exemplo", 4.4, 57],
  ["Clínica Essência", "Centro", "cel", "instagram.com/essencia", 4.6, 176],
  ["Bela Face Harmonização", "Santa Terezinha", "cel", null, 4.9, 63],
  ["Spa Urbano Mutum", "Centro", "sem", null, 4.2, 12],
  ["Estética Mãos de Fada", "Boa Vista", "cel", "linktr.ee/maosdefada", 4.8, 97],
  ["Clínica Derme & Cia", "Centro", "cel", "dermeecia.exemplo", 4.5, 305],
  ["Ateliê da Beleza", "São Vicente", "cel", null, 4.7, 29],
  ["Corpo Leve Estética", "Planalto", "cel", "instagram.com/corpoleve", 4.3, 18],
  ["Nova Pele Laser", "Centro", "cel", "novapele.exemplo", 4.9, 241],
  ["Clínica Bem-Estar Mutum", "Boa Vista", "fixo", null, 4.1, 9],
  ["Studio Glow", "Centro", "cel", null, 4.8, 74],
  ["Harmonia Estética Integrada", "Santa Terezinha", "cel", "instagram.com/harmoniaest", 4.6, 52],
];

const DENTISTA: Base[] = [
  ["Odonto Sorriso Manhuaçu", "Centro", "cel", "sorrisomhu.exemplo", 4.8, 402],
  ["Clínica Dental Vida", "Coqueiro", "cel", null, 4.7, 96],
  ["Consultório Dr. Ramos", "Centro", "fixo", null, 4.9, 33],
  ["Prime Odontologia", "Bom Pastor", "cel", "instagram.com/primeodonto", 4.6, 151],
  ["OdontoFamília", "Centro", "cel", "odontofamilia.exemplo", 4.5, 210],
  ["Sorrir Mais Implantes", "Engenho da Serra", "cel", null, 4.9, 77],
  ["Clínica Oral Center", "Centro", "cel", "instagram.com/oralcenter", 4.4, 64],
  ["Dente de Leite Odontopediatria", "Coqueiro", "cel", null, 5.0, 45],
  ["Estética Dental Manhuaçu", "Centro", "sem", null, 4.3, 11],
  ["Ortho Center", "Bom Pastor", "cel", "orthocenter.exemplo", 4.7, 188],
  ["Clínica Sorriso Real", "Centro", "cel", null, 4.6, 59],
  ["Odonto Excellence", "Engenho da Serra", "cel", "instagram.com/odontoexc", 4.8, 120],
];

function leadsDaBusca(buscaId: string, cidade: string, segmento: string, ddd: string, base: Base[], inicio: number): Lead[] {
  return base.map(([nome, bairro, tel, site, nota, avaliacoes], i) => ({
    id: `${buscaId}-${i + 1}`,
    buscaId,
    nome,
    segmento,
    bairro,
    cidade,
    telefone: tel === "cel" ? `${ddd}90000${String(inicio + i).padStart(4, "0")}` : tel === "fixo" ? `${ddd}3331${String(inicio + i).padStart(4, "0")}` : null,
    site,
    nota,
    avaliacoes,
    marcacao: null,
    parouEm: null,
    campanhaIds: [],
  }));
}

/** Os envios de uma campanha, espalhados pela janela (uma faixa de 1h por envio), a partir do dia `diasAtras`. */
function enviar(
  leads: Lead[],
  quantos: number,
  diasAtras: number,
  agora: number,
  sorteio: () => number,
  respostas: Record<number, "respondeu" | "parou" | "falhou">,
): EnvioDaCampanha[] {
  const hoje = diaIsoSP(agora);
  return leads.map((l, ordem) => {
    if (ordem >= quantos) return { leadId: l.id, situacao: "na_fila", variante: null, enviadoEm: null, respondeuEm: null };
    const dia = somarDias(hoje, -diasAtras + Math.floor(ordem / 10));
    const enviadoEm = Math.round(inicioDoDiaSP(dia) + (8 + (ordem % 10)) * H + sorteio() * 50 * MIN);
    const r = respostas[ordem];
    const variante = varianteDaOrdem(ordem, 3);
    if (r === "falhou") return { leadId: l.id, situacao: "falhou", variante, enviadoEm: null, respondeuEm: null };
    const respondeuEm = r ? Math.min(agora - 5 * MIN, Math.round(enviadoEm + (10 + sorteio() * 240) * MIN)) : null;
    return { leadId: l.id, situacao: r ?? "enviado", variante, enviadoEm, respondeuEm };
  });
}

export interface DadosDeMentira {
  buscas: Busca[];
  leads: Lead[];
  campanhas: Campanha[];
}

export function dadosDeMentira(agora: number, vazio: boolean): DadosDeMentira {
  if (vazio) return { buscas: [], leads: [], campanhas: [] };
  const sorteio = sorteador(29102026);
  const D = 24 * H;

  const buscas: Busca[] = [
    { id: "b3", termo: "barbearia", cidade: "Caratinga", criadaEm: agora - 6 * MIN, situacao: "buscando", total: 0, erro: null },
    { id: "b1", termo: "clínica de estética", cidade: "Mutum", criadaEm: agora - 3 * D, situacao: "pronta", total: ESTETICA.length, erro: null },
    { id: "b4", termo: "ótica", cidade: "Ipatinga", criadaEm: agora - 4 * D, situacao: "falhou", total: 0, erro: "A fonte não respondeu a tempo. Nada foi gravado; dá para buscar de novo." },
    { id: "b2", termo: "dentista", cidade: "Manhuaçu", criadaEm: agora - 9 * D, situacao: "pronta", total: DENTISTA.length, erro: null },
  ];

  const leads = [
    ...leadsDaBusca("b1", "Mutum", "Clínica de estética", "33", ESTETICA, 100),
    ...leadsDaBusca("b2", "Manhuaçu", "Dentista", "33", DENTISTA, 200),
  ];
  // O dono já olhou parte da busca de estética.
  for (const id of ["b1-1", "b1-4", "b1-7", "b1-15"]) leads.find((l) => l.id === id)!.marcacao = "bom";
  leads.find((l) => l.id === "b1-12")!.marcacao = "descartado";

  const base = (id: string, nome: string, extra: Partial<Campanha>): Campanha => ({
    id,
    nome,
    situacao: "rascunho",
    agendadaPara: null,
    conexaoId: "obs",
    filtro: { buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
    variantes: [...VARIANTES_SUGERIDAS],
    envios: [],
    criadaEm: agora - D,
    salvaEm: agora - D,
    passo: 1,
    ...extra,
  });

  // Dentistas: concluída há uma semana, todos enviados num dia.
  const c2Leads = leadsDoFiltro(leads, { buscaId: "b2", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null }, []).slice(0, 8);
  const c2 = base("c2", "Dentistas de Manhuaçu", {
    situacao: "concluida",
    filtro: { buscaId: "b2", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
    envios: enviar(c2Leads, c2Leads.length, 8, agora, sorteio, { 1: "respondeu", 3: "respondeu", 5: "parou", 8: "respondeu" }),
    criadaEm: agora - 9 * D,
    salvaEm: agora - 8 * D,
    passo: 4,
  });

  // Estética: rodando desde ontem, 7 enviadas e 2 na fila.
  const c1Leads = leadsDoFiltro(leads, { buscaId: "b1", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null }, []).slice(0, 9);
  const c1 = base("c1", "Estética em Mutum", {
    situacao: "rodando",
    filtro: { buscaId: "b1", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
    envios: enviar(c1Leads, Math.min(c1Leads.length, 7), 1, agora, sorteio, {
      0: "respondeu",
      2: "respondeu",
      4: "falhou",
      6: "parou",
      7: "respondeu",
    }),
    criadaEm: agora - 3 * D,
    salvaEm: agora - 2 * D,
    passo: 4,
  });

  for (const c of [c1, c2]) for (const e of c.envios) leads.find((l) => l.id === e.leadId)!.campanhaIds.push(c.id);
  for (const c of [c1, c2]) for (const e of c.envios) if (e.situacao === "parou") leads.find((l) => l.id === e.leadId)!.parouEm = e.respondeuEm;

  // Quem não respondeu aos dentistas: agendada para amanhã às 8h.
  const c4Filtro = { buscaId: "todas" as const, soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: "c2" };
  const c4 = base("c4", "Dentistas de Manhuaçu, segunda chance", {
    situacao: "agendada",
    agendadaPara: inicioDoDiaSP(somarDias(diaIsoSP(agora), 1)) + 8 * H,
    filtro: c4Filtro,
    envios: leadsDoFiltro(leads, c4Filtro, [c2]).map((l) => ({ leadId: l.id, situacao: "na_fila", variante: null, enviadoEm: null, respondeuEm: null })),
    criadaEm: agora - 2 * H,
    salvaEm: agora - 2 * H,
    passo: 4,
  });
  for (const e of c4.envios) leads.find((l) => l.id === e.leadId)!.campanhaIds.push("c4");

  // Barbearias: rascunho parado no passo Contatos, esperando a busca terminar.
  const c3 = base("c3", "Barbearias de Caratinga", {
    filtro: { buscaId: "b3", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
    criadaEm: agora - 10 * MIN,
    salvaEm: agora - 8 * MIN,
    passo: 2,
  });

  return { buscas, leads, campanhas: [c3, c1, c4, c2] };
}

/** As empresas que uma busca nova de mentira "acha" depois de alguns segundos. */
export function resultadoDaBuscaDeMentira(buscaId: string, termo: string, cidade: string, inicio: number): Lead[] {
  const nomes = ["Central", "Prime", "Bem Viver", "Nova Era", "Real", "Vida", "Top", "Família"];
  const segmento = termo.charAt(0).toUpperCase() + termo.slice(1);
  return leadsDaBusca(
    buscaId,
    cidade,
    segmento,
    "33",
    nomes.map((n, i) => [`${segmento} ${n}`, "Centro", i % 5 === 4 ? "fixo" : "cel", i % 3 === 0 ? null : `${n.toLowerCase().replace(/\s/g, "")}.exemplo`, 4 + (i % 10) / 10, 10 + i * 23]),
    inicio,
  );
}
