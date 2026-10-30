import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import arquivoDeMunicipios from "@/lib/dados/municipios.json";
import { municipiosDoArquivo } from "@/lib/municipios";
import { OPCOES_PADRAO, VARIANTES_SUGERIDAS, diaDaSemanaSP, varianteDaOrdem, type DetalhesDoLead } from "@/lib/prospeccao";
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

type Base = [
  nome: string,
  bairro: string,
  telefone: "cel" | "fixo" | "sem",
  site: string | null,
  nota: number | null,
  avaliacoes: number | null,
  /** A categoria do Google, quando não é o segmento da busca (o dentista que veio na busca de estética). */
  categoria?: string,
];

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
  // A busca real de 30/10/2026 trouxe um dentista no meio, com telefone fixo e um "site" que era post do Instagram.
  ["Sorriso Mutum Odontologia", "Centro", "fixo", "instagram.com/p/Cx9Exemplo", 4.7, 38, "Dentista"],
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

const MUNICIPIOS_MG = municipiosDoArquivo(arquivoDeMunicipios).MG ?? [];

// Os horários de mentira: comercial com sábado de manhã; fecha no almoço e não abre sábado;
// fecha 17h30; aberto até as 20h de segunda a sábado (este não tem gancho).
const HORARIOS: [number, number][][][] = [
  [[[480, 1080]], [[480, 1080]], [[480, 1080]], [[480, 1080]], [[480, 1080]], [[480, 720]], []],
  [[[480, 720], [840, 1080]], [[480, 720], [840, 1080]], [[480, 720], [840, 1080]], [[480, 720], [840, 1080]], [[480, 720], [840, 1080]], [], []],
  [[[540, 1050]], [[540, 1050]], [[540, 1050]], [[540, 1050]], [[540, 1050]], [], []],
  [[[480, 1200]], [[480, 1200]], [[480, 1200]], [[480, 1200]], [[480, 1200]], [[480, 1200]], []],
];

/** Detalhes de mentira, repetíveis por lead: ponto perto do centro da cidade, horário, notas, fotos. */
function detalhesDeMentira(id: string, cidade: string, bairro: string, segmento: string, site: string | null, nota: number | null, avaliacoes: number | null, categoria?: string): DetalhesDoLead {
  const sorteio = sorteador([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) | 0);
  const centro = MUNICIPIOS_MG.find((m) => m.nome === cidade);
  const horario = HORARIOS[Math.floor(sorteio() * HORARIOS.length)];
  const total = avaliacoes ?? 0;
  const alta = nota === null ? 0.5 : Math.min(0.95, Math.max(0.3, (nota - 3.5) / 1.5));
  const arroba = site?.match(/instagram\.com\/([a-z0-9_.]+)$/i)?.[1];
  return {
    lat: centro?.lat != null ? Math.round((centro.lat + (sorteio() - 0.5) * 0.024) * 1e5) / 1e5 : null,
    lng: centro?.lng != null ? Math.round((centro.lng + (sorteio() - 0.5) * 0.024) * 1e5) / 1e5 : null,
    reivindicado: sorteio() >= 0.35,
    horarios: horario.map((faixas, i) => ({ dow: (i + 1) % 7, faixas })),
    distribuicao:
      total === 0
        ? null
        : { 5: Math.round(total * alta), 4: Math.round(total * (1 - alta) * 0.6), 3: Math.round(total * (1 - alta) * 0.25), 2: Math.round(total * (1 - alta) * 0.1), 1: Math.round(total * (1 - alta) * 0.05) },
    fotos: Math.round(sorteio() * 80),
    categorias: [categoria ?? segmento, ...(sorteio() < 0.4 ? ["Serviço de saúde e beleza"] : [])],
    endereco: `Rua ${["das Flores", "São Paulo", "Sete de Setembro", "Minas Gerais"][Math.floor(sorteio() * 4)]}, ${10 + Math.floor(sorteio() * 900)}, ${bairro}, ${cidade} - MG`,
    instagram: arroba ? `@${arroba}` : null,
  };
}

function leadsDaBusca(buscaId: string, cidade: string, segmento: string, ddd: string, base: Base[], inicio: number): Lead[] {
  return base.map(([nome, bairro, tel, site, nota, avaliacoes, categoria], i) => ({
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
    detalhes: detalhesDeMentira(`${buscaId}-${i + 1}`, cidade, bairro, categoria ?? segmento, site, nota, avaliacoes, categoria),
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

// ── O histórico gerado ──────────────────────────────────────────────────

const SUFIXOS = [
  "Central", "Prime", "Bem Viver", "Nova Era", "Real", "Vida", "Top", "Família", "Excellence", "Premium",
  "do Bairro", "Avenida", "Santa Luzia", "São José", "Ideal", "Mais", "Express", "Point", "Master", "Elite",
  "Primavera", "Horizonte", "Bela Vista", "Jardim", "Esperança", "Aliança", "Vitória", "Estrela", "Sol", "Luz",
  "Harmonia", "Equilíbrio", "Movimento", "Essencial", "Origem", "Raiz", "Ponto Certo", "Conceito", "Moderna", "Clássica",
  "Avanço", "Leste", "Oeste", "Norte", "Sul", "Centro Sul", "Boa Vista", "Planalto", "Serrana", "Vale",
];
const BAIRROS = ["Centro", "Jardim", "Vila Nova", "São Pedro", "Bela Vista", "Santa Rita", "Industrial", "Esplanada"];

function baseGerada(prefixo: string, quantos: number, sorteio: () => number): Base[] {
  return Array.from({ length: quantos }, (_, i) => {
    const r = sorteio();
    const tel = r < 0.8 ? "cel" : r < 0.92 ? "fixo" : "sem";
    const s = sorteio();
    const slug = SUFIXOS[i % SUFIXOS.length].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
    const site = s < 0.35 ? null : s < 0.65 ? `instagram.com/${slug}` : `${slug}.exemplo`;
    const temNota = sorteio() > 0.06;
    return [
      `${prefixo} ${SUFIXOS[i % SUFIXOS.length]}${i >= SUFIXOS.length ? " II" : ""}`,
      BAIRROS[Math.floor(sorteio() * BAIRROS.length)],
      tel,
      site,
      temNota ? Math.round((3.8 + sorteio() * 1.2) * 10) / 10 : null,
      temNota ? Math.round(5 + sorteio() * sorteio() * 400) : null,
    ] as Base;
  });
}

interface Historico {
  termo: string;
  segmento: string;
  prefixo: string;
  cidade: string;
  ddd: string;
  leads: number;
  diasAtras: number;
  campanha?: { nome: string; tamanho: number; situacao: Campanha["situacao"]; ate?: number };
}

const HISTORICO: Historico[] = [
  { termo: "academia", segmento: "Academia", prefixo: "Academia", cidade: "Governador Valadares", ddd: "33", leads: 48, diasAtras: 52, campanha: { nome: "Academias de Governador Valadares", tamanho: 40, situacao: "concluida" } },
  { termo: "pet shop", segmento: "Pet shop", prefixo: "Pet Shop", cidade: "Ipatinga", ddd: "31", leads: 41, diasAtras: 44, campanha: { nome: "Pet shops de Ipatinga", tamanho: 35, situacao: "concluida" } },
  { termo: "salão de beleza", segmento: "Salão de beleza", prefixo: "Salão", cidade: "Caratinga", ddd: "33", leads: 36, diasAtras: 36, campanha: { nome: "Salões de Caratinga", tamanho: 30, situacao: "concluida" } },
  { termo: "ótica", segmento: "Ótica", prefixo: "Ótica", cidade: "Teófilo Otoni", ddd: "33", leads: 34, diasAtras: 28, campanha: { nome: "Óticas de Teófilo Otoni", tamanho: 30, situacao: "concluida" } },
  { termo: "nutricionista", segmento: "Nutricionista", prefixo: "Nutri", cidade: "Viçosa", ddd: "31", leads: 29, diasAtras: 22, campanha: { nome: "Nutricionistas de Viçosa", tamanho: 25, situacao: "concluida" } },
  { termo: "fisioterapia", segmento: "Fisioterapia", prefixo: "Fisio", cidade: "Muriaé", ddd: "32", leads: 33, diasAtras: 17, campanha: { nome: "Fisioterapia em Muriaé", tamanho: 30, situacao: "concluida" } },
  { termo: "imobiliária", segmento: "Imobiliária", prefixo: "Imobiliária", cidade: "Ponte Nova", ddd: "31", leads: 44, diasAtras: 11, campanha: { nome: "Imobiliárias de Ponte Nova", tamanho: 40, situacao: "pausada", ate: 25 } },
  { termo: "autoescola", segmento: "Autoescola", prefixo: "Autoescola", cidade: "Timóteo", ddd: "31", leads: 38, diasAtras: 2, campanha: { nome: "Autoescolas de Timóteo", tamanho: 35, situacao: "rodando" } },
  { termo: "clínica veterinária", segmento: "Clínica veterinária", prefixo: "Clínica Veterinária", cidade: "Aimorés", ddd: "33", leads: 22, diasAtras: 5 },
  { termo: "estúdio de pilates", segmento: "Pilates", prefixo: "Pilates", cidade: "Coronel Fabriciano", ddd: "31", leads: 18, diasAtras: 1 },
];

/** O peso de resposta por hora do envio, por dia da semana (0 = domingo) e por variante. */
const PESO_DA_HORA: Record<number, number> = { 8: 0.8, 9: 1.4, 10: 1.5, 11: 1.1, 12: 0.6, 13: 0.7, 14: 1.3, 15: 1.1, 16: 0.9, 17: 0.7 };
const PESO_DO_DIA = [0.5, 1, 1.4, 1.3, 1.1, 0.9, 0.6];
const PESO_DA_VARIANTE = [1, 1.45, 0.85];

/** Os envios de uma campanha a 10 por dia desde `inicio`, cada um numa faixa de 1h sorteada; respostas pelo padrão. */
function enviarComPadrao(leads: Lead[], inicio: string, agora: number, sorteio: () => number, ate?: number): EnvioDaCampanha[] {
  let faixas: number[] = [];
  return leads.map((l, ordem) => {
    if (ordem % 10 === 0) {
      // Fisher-Yates: o mesmo embaralhamento no servidor e no navegador.
      faixas = Array.from({ length: 10 }, (_, i) => i);
      for (let i = faixas.length - 1; i > 0; i--) {
        const j = Math.floor(sorteio() * (i + 1));
        [faixas[i], faixas[j]] = [faixas[j], faixas[i]];
      }
    }
    const variante = varianteDaOrdem(ordem, 3);
    const dia = somarDias(inicio, Math.floor(ordem / 10));
    const hora = 8 + faixas[ordem % 10];
    const enviadoEm = Math.round(inicioDoDiaSP(dia) + hora * H + sorteio() * 50 * MIN);
    if (enviadoEm > agora || (ate !== undefined && ordem >= ate))
      return { leadId: l.id, situacao: "na_fila", variante: null, enviadoEm: null, respondeuEm: null };
    const p = 0.17 * PESO_DA_HORA[hora] * PESO_DO_DIA[diaDaSemanaSP(enviadoEm)] * PESO_DA_VARIANTE[variante];
    const r = sorteio();
    if (r < 0.03) return { leadId: l.id, situacao: "falhou", variante, enviadoEm: null, respondeuEm: null };
    if (r >= 0.03 + p) return { leadId: l.id, situacao: "enviado", variante, enviadoEm, respondeuEm: null };
    const respondeuEm = Math.min(agora - 5 * MIN, Math.round(enviadoEm + (6 + sorteio() * sorteio() * 600) * MIN));
    return { leadId: l.id, situacao: sorteio() < 0.18 ? "parou" : "respondeu", variante, enviadoEm, respondeuEm };
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

  const buscas: Omit<Busca, "opcoes">[] = [
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

  // O histórico: buscas e campanhas antigas geradas com um padrão de resposta
  // (melhor de manhã e no meio da tarde, de terça a quinta, a variante 2 à
  // frente), para os gráficos e a paginação terem o que mostrar.
  const geradas: Campanha[] = [];
  HISTORICO.forEach((h, k) => {
    const buscaId = `h${k + 1}`;
    buscas.push({
      id: buscaId,
      termo: h.termo,
      cidade: h.cidade,
      criadaEm: agora - (h.diasAtras + 1) * D - 3 * H,
      situacao: "pronta",
      total: h.leads,
      erro: null,
    });
    leads.push(...leadsDaBusca(buscaId, h.cidade, h.segmento, h.ddd, baseGerada(h.prefixo, h.leads, sorteio), 1000 + k * 100));
    if (!h.campanha) return;
    const filtro = { buscaId, soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null };
    const daBusca = leadsDoFiltro(leads, filtro, []).slice(0, h.campanha.tamanho);
    const inicio = somarDias(diaIsoSP(agora), -h.diasAtras);
    geradas.push(
      base(`g${k + 1}`, h.campanha.nome, {
        situacao: h.campanha.situacao,
        filtro,
        envios: enviarComPadrao(daBusca, inicio, agora, sorteio, h.campanha.ate),
        criadaEm: agora - (h.diasAtras + 1) * D,
        salvaEm: agora - h.diasAtras * D,
        passo: 4,
      }),
    );
  });

  for (const c of [c1, c2, ...geradas]) for (const e of c.envios) leads.find((l) => l.id === e.leadId)!.campanhaIds.push(c.id);
  for (const c of [c1, c2, ...geradas])
    for (const e of c.envios) if (e.situacao === "parou") leads.find((l) => l.id === e.leadId)!.parouEm = e.respondeuEm;

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

  buscas.sort((a, b) => b.criadaEm - a.criadaEm);
  const comOpcoes: Busca[] = buscas.map((b, i) => {
    const cidade = MUNICIPIOS_MG.find((m) => m.nome === b.cidade) ?? null;
    // A busca de estética em Mutum foi feita com o centro e o raio ajustados no mapa (5 km).
    const area = b.id === "b1" && cidade?.lat != null && cidade.lng != null ? { lat: cidade.lat, lng: cidade.lng, raioKm: 5 } : null;
    return {
      ...b,
      opcoes: {
        ...OPCOES_PADRAO,
        termos: [b.termo],
        cidade: b.cidade,
        uf: "MG",
        cidadeIbge: cidade?.ibge ?? null,
        area,
        porTermo: b.total > 40 ? 100 : 50,
        notaMinima: i % 4 === 1 ? 4 : null,
      },
    };
  });
  const campanhas = [c3, c1, c4, c2, ...geradas].sort((a, b) =>
    a.situacao === "rascunho" ? -1 : b.situacao === "rascunho" ? 1 : b.criadaEm - a.criadaEm,
  );
  return { buscas: comOpcoes, leads, campanhas };
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
