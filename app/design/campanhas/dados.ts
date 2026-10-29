import {
  JANELA_PROVISORIA,
  PAUSA_PROVISORIA_MINUTOS,
  TETO_MAXIMO_DIARIO,
  ROTULO_DO_ITEM,
  classeDaUrl,
  type ItemDoSite,
  type RaioXDoSite,
  type SituacaoDoLead,
} from "@/lib/prospeccao";
import type {
  ConfigDaCampanha,
  EmpresaAchada,
  LeadDaCampanha,
  ConexaoDisponivel,
} from "@/components/admin/campanhas/tipos";

// DADOS DE MENTIRA do preview de Campanhas (`/design/campanhas`). Empresas,
// telefones e respostas inventados: nada aqui existe, nada é enviado e nenhuma
// API de busca é chamada. Os telefones usam o prefixo 90000, para não
// coincidirem com um número de verdade.

const H = 3_600_000;
const D = 24 * H;

type Base = Omit<EmpresaAchada, "sinais" | "cidade"> & {
  fechaCedo?: boolean;
  fechaNoFimDeSemana?: boolean;
  whatsappNoSite?: boolean;
  bloqueado?: EmpresaAchada["sinais"]["bloqueado"];
};

const CIDADE = "Cidade Exemplo";

const BASE: Base[] = [
  { fonteId: "f-01", nome: "Clínica Sorriso Pleno", segmento: "Odontologia", bairro: "Centro", telefone: "11900000101", site: "sorrisopleno.exemplo", nota: 4.8, avaliacoes: 312, horario: "Seg a sex 8h às 18h, sáb 8h às 12h", fechaNoFimDeSemana: true, whatsappNoSite: true },
  { fonteId: "f-02", nome: "Studio Bela Forma", segmento: "Estética", bairro: "Jardim América", telefone: "11900000102", site: null, nota: 4.9, avaliacoes: 188, horario: "Seg a sáb 9h às 19h", fechaNoFimDeSemana: true },
  { fonteId: "f-03", nome: "Barbearia Navalha de Ouro", segmento: "Barbearia", bairro: "Vila Nova", telefone: "11900000103", site: "instagram.com/navalha", nota: 4.7, avaliacoes: 421, horario: "Ter a sáb 9h às 20h", fechaNoFimDeSemana: true, whatsappNoSite: true },
  { fonteId: "f-04", nome: "Ótica Visão Clara", segmento: "Ótica", bairro: "Centro", telefone: "1133330104", site: "visaoclara.exemplo", nota: 4.5, avaliacoes: 96, horario: "Seg a sex 9h às 18h", fechaCedo: true },
  { fonteId: "f-05", nome: "Pet Amigo Banho e Tosa", segmento: "Pet shop", bairro: "Bela Vista", telefone: "11900000105", site: null, nota: 4.6, avaliacoes: 154, horario: "Seg a sáb 8h às 18h", fechaCedo: true, fechaNoFimDeSemana: true },
  { fonteId: "f-06", nome: "Advocacia Lima e Prado", segmento: "Advocacia", bairro: "Centro", telefone: "11900000106", site: "limaprado.exemplo", nota: 5.0, avaliacoes: 41, horario: "Seg a sex 9h às 17h", fechaCedo: true, whatsappNoSite: true },
  { fonteId: "f-07", nome: "Academia Movimento", segmento: "Academia", bairro: "Jardim América", telefone: "11900000107", site: "movimento.exemplo", nota: 4.4, avaliacoes: 512, horario: "Seg a sex 6h às 22h, sáb 8h às 14h", whatsappNoSite: true },
  { fonteId: "f-08", nome: "Salão Cachos e Cia", segmento: "Salão de beleza", bairro: "Vila Nova", telefone: "11900000108", site: null, nota: 4.8, avaliacoes: 233, horario: "Ter a sáb 9h às 19h", fechaNoFimDeSemana: true },
  { fonteId: "f-09", nome: "Clínica Vida Plena", segmento: "Clínica médica", bairro: "Bela Vista", telefone: "11900000109", site: "vidaplena.exemplo", nota: 4.3, avaliacoes: 78, horario: "Seg a sex 7h às 19h", whatsappNoSite: false, bloqueado: "cliente" },
  { fonteId: "f-10", nome: "Padaria Pão Quente", segmento: "Padaria", bairro: "Centro", telefone: "11900000110", site: null, nota: 4.6, avaliacoes: 640, horario: "Todos os dias 6h às 21h" },
  { fonteId: "f-11", nome: "Estética Pele Viva", segmento: "Estética", bairro: "Centro", telefone: "11900000111", site: "peleviva.exemplo", nota: 4.9, avaliacoes: 64, horario: "Seg a sex 9h às 18h", fechaCedo: true, fechaNoFimDeSemana: true, whatsappNoSite: true },
  { fonteId: "f-12", nome: "Odonto Família", segmento: "Odontologia", bairro: "Vila Nova", telefone: "11900000112", site: null, nota: 4.2, avaliacoes: 37, horario: "Seg a sex 8h às 17h", fechaCedo: true, fechaNoFimDeSemana: true },
  { fonteId: "f-13", nome: "Barbearia Dom Bigode", segmento: "Barbearia", bairro: "Jardim América", telefone: "11900000113", site: "instagram.com/dombigode", nota: 4.9, avaliacoes: 289, horario: "Seg a sáb 10h às 20h", fechaNoFimDeSemana: true, whatsappNoSite: true, bloqueado: "saiu" },
  { fonteId: "f-14", nome: "Ótica Olhar Certo", segmento: "Ótica", bairro: "Bela Vista", telefone: "11900000114", site: "olharcerto.exemplo", nota: 4.7, avaliacoes: 122, horario: "Seg a sex 9h às 18h, sáb 9h às 13h", fechaCedo: true, fechaNoFimDeSemana: true },
  { fonteId: "f-15", nome: "Fisio Equilíbrio", segmento: "Clínica de fisioterapia", bairro: "Centro", telefone: "11900000115", site: "equilibrio.exemplo", nota: 4.8, avaliacoes: 205, horario: "Seg a sex 7h às 20h", whatsappNoSite: true },
  { fonteId: "f-16", nome: "Salão Glamour", segmento: "Salão de beleza", bairro: "Centro", telefone: "11900000116", site: null, nota: 4.5, avaliacoes: 58, horario: "Ter a sáb 9h às 18h", fechaCedo: true, fechaNoFimDeSemana: true },
  { fonteId: "f-17", nome: "Clínica Bem Estar", segmento: "Clínica médica", bairro: "Vila Nova", telefone: "11900000117", site: "bemestar.exemplo", nota: 4.6, avaliacoes: 143, horario: "Seg a sex 7h às 18h", fechaNoFimDeSemana: true },
  { fonteId: "f-18", nome: "Pet Feliz Clínica Veterinária", segmento: "Pet shop", bairro: "Jardim América", telefone: "11900000118", site: "petfeliz.exemplo", nota: 4.7, avaliacoes: 267, horario: "Seg a sáb 8h às 20h", whatsappNoSite: true },
  { fonteId: "f-19", nome: "Estúdio Unhas de Gel", segmento: "Estética", bairro: "Bela Vista", telefone: "11900000119", site: null, nota: 4.4, avaliacoes: 29, horario: "Seg a sáb 9h às 19h" },
  { fonteId: "f-20", nome: "Consultório Dra. Exemplo", segmento: "Clínica médica", bairro: "Centro", telefone: "11900000120", site: null, nota: 4.9, avaliacoes: 88, horario: "Seg a qui 8h às 17h", fechaCedo: true, fechaNoFimDeSemana: true },
  { fonteId: "f-21", nome: "Barbearia do Zé", segmento: "Barbearia", bairro: "Centro", telefone: "11900000121", site: null, nota: 4.6, avaliacoes: 174, horario: "Seg a sáb 9h às 19h", fechaNoFimDeSemana: true },
  { fonteId: "f-22", nome: "Odonto Center Sorriso", segmento: "Odontologia", bairro: "Bela Vista", telefone: "11900000122", site: "odontocenter.exemplo", nota: 4.5, avaliacoes: 230, horario: "Seg a sex 8h às 20h, sáb 8h às 12h", whatsappNoSite: true },
];

/** O que o raio-X "achou" em cada site de mentira (o que falta), e o que está fora do ar. */
const FALTA_NO_SITE: Record<string, ItemDoSite[]> = {
  "f-01": ["mapa", "fotos"],
  "f-04": ["telefone_clicavel", "mapa"],
  "f-06": ["celular", "https"],
  "f-11": ["telefone_clicavel", "mapa"],
  "f-17": ["endereco", "mapa"],
  "f-18": ["mapa", "email"],
};
const FORA_DO_AR = new Set(["f-14"]);

function raioX(b: Base): RaioXDoSite {
  const pelaUrl = classeDaUrl(b.site);
  if (pelaUrl) return { classe: pelaUrl, tem: [], falta: [] };
  if (FORA_DO_AR.has(b.fonteId)) return { classe: "fora_do_ar", tem: [], falta: [] };
  const falta = [...(FALTA_NO_SITE[b.fonteId] ?? []), ...(b.whatsappNoSite ? [] : (["whatsapp"] as ItemDoSite[]))];
  const tem = (Object.keys(ROTULO_DO_ITEM) as ItemDoSite[]).filter((i) => !falta.includes(i));
  return { classe: falta.length > 0 ? "com_falhas" : "bom", tem, falta };
}

function empresa(b: Base): EmpresaAchada {
  const { fechaCedo = false, fechaNoFimDeSemana = false, bloqueado = null, ...resto } = b;
  delete resto.whatsappNoSite;
  return {
    ...resto,
    cidade: CIDADE,
    sinais: {
      telefone: b.telefone,
      segmento: b.segmento,
      avaliacoes: b.avaliacoes,
      nota: b.nota,
      fechaCedo,
      fechaNoFimDeSemana,
      site: raioX(b),
      bloqueado,
    },
  };
}

export const EMPRESAS_ACHADAS: EmpresaAchada[] = BASE.map(empresa);

/** Simula a busca (Google Places ou outra fonte, decisão D3): filtra o banco de mentira pelo segmento. */
export function buscarDeMentira(segmento: string): EmpresaAchada[] {
  const s = segmento.trim().toLowerCase();
  if (s === "") return EMPRESAS_ACHADAS;
  return EMPRESAS_ACHADAS.filter((e) => e.segmento.toLowerCase().includes(s) || e.nome.toLowerCase().includes(s));
}

interface Andamento {
  fonteId: string;
  situacao: SituacaoDoLead;
  toque: number;
  abordadoHa?: number;
  respondeuHa?: number;
  resposta?: string;
}

/** Os leads já escolhidos, cada um num ponto da campanha. */
const ANDAMENTO: Andamento[] = [
  { fonteId: "f-04", situacao: "sem_telefone", toque: 0 },
  { fonteId: "f-01", situacao: "qualificado", toque: 1, abordadoHa: 2 * D, respondeuHa: 2 * D - 40 * 60_000, resposta: "Oi Franck! Fica sim, principalmente no sábado à tarde. Como funciona?" },
  { fonteId: "f-03", situacao: "convertido", toque: 1, abordadoHa: 6 * D, respondeuHa: 6 * D - 2 * H, resposta: "Me manda o link que eu testo hoje" },
  { fonteId: "f-02", situacao: "abordado", toque: 1, abordadoHa: 3 * D + 2 * H },
  { fonteId: "f-05", situacao: "abordado", toque: 2, abordadoHa: 7 * D + H },
  { fonteId: "f-08", situacao: "saiu", toque: 1, abordadoHa: 4 * D, respondeuHa: 4 * D - 3 * H, resposta: "SAIR" },
  { fonteId: "f-12", situacao: "falhou", toque: 1, abordadoHa: 1 * D },
  { fonteId: "f-11", situacao: "abordado", toque: 1, abordadoHa: 1 * D },
  { fonteId: "f-14", situacao: "escolhido", toque: 0 },
  { fonteId: "f-15", situacao: "escolhido", toque: 0 },
  { fonteId: "f-17", situacao: "escolhido", toque: 0 },
  { fonteId: "f-18", situacao: "escolhido", toque: 0 },
  { fonteId: "f-06", situacao: "escolhido", toque: 0 },
  { fonteId: "f-16", situacao: "escolhido", toque: 0 },
  { fonteId: "f-22", situacao: "escolhido", toque: 0 },
  { fonteId: "f-20", situacao: "descartado", toque: 0 },
];

const CADENCIA_DIAS = [0, 3, 7];

export function leadsDeMentira(agora: number): LeadDaCampanha[] {
  return ANDAMENTO.map((a, i) => {
    const e = EMPRESAS_ACHADAS.find((x) => x.fonteId === a.fonteId)!;
    // Abordado há `abordadoHa` = o primeiro toque saiu nesse instante.
    const primeiro = a.abordadoHa !== undefined ? agora - a.abordadoHa : null;
    const proximoDia = CADENCIA_DIAS[a.toque];
    return {
      ...e,
      id: `lead-${i + 1}`,
      situacao: a.situacao,
      toque: a.toque,
      abordadoEm: primeiro,
      respondeuEm: a.respondeuHa !== undefined ? agora - a.respondeuHa : null,
      proximoToqueEm:
        a.situacao === "abordado" && primeiro !== null && proximoDia !== undefined ? primeiro + proximoDia * D : null,
      ultimaResposta: a.resposta ?? null,
    };
  });
}

/** Ofertas, voz e textos de EXEMPLO (o dono escreve os de verdade, decisão D5). */
export const CONFIG_DE_MENTIRA: ConfigDaCampanha = {
  nome: "Clínicas e salões, Cidade Exemplo",
  segmento: "Clínicas, estética, salões e barbearias",
  cidade: CIDADE,
  ofertas: ["site", "atenda"],
  conexaoId: "obs",
  comoComecar:
    "Quem respondeu recebeu uma mensagem da OBS sobre o site ou o WhatsApp da empresa. Agradeça, mande o diagnóstico curto do que foi visto e pergunte se faz sentido uma conversa rápida. Ofereça o teste de 7 dias do Atenda quando o assunto for atendimento.",
  qualificado: "Confirmou a necessidade e topou uma conversa de diagnóstico ou uma demonstração.",
  objecoes: [
    { objecao: "Já tenho site", resposta: "Ótimo. A ideia não é trocar por trocar: é corrigir o que faz o cliente desistir, como o telefone que não dá para tocar no celular." },
    { objecao: "Já tenho Instagram, não preciso de site", resposta: "O Instagram fala com quem já segue; o site aparece para quem pesquisa no Google sem conhecer a empresa." },
    { objecao: "Não tenho tempo para responder WhatsApp", resposta: "É por isso: o atendente com IA responde na hora e só chama vocês quando precisa." },
  ],
  saida: "primeira",
  voz: {
    meuNome: "Franck",
    minhaEmpresa: "OBS",
    oQueFaco: "sites e atendimento com IA no WhatsApp para pequenos negócios",
    diferencial: "",
  },
  textos: {
    primeira: {
      site: "Oi, tudo bem? Sou o {meu_nome}, da {minha_empresa}, aqui de {cidade}. Procurei {nome} no Google e vi que a empresa {falta_no_site}. Isso faz quem pesquisa ligar para outro lugar. Posso te mandar o que eu vi?",
      atenda: "Oi, tudo bem? Sou o {meu_nome}, da {minha_empresa}, aqui de {cidade}. Vi que {nome} {horario_curto}. Quem chama no WhatsApp fora desse horário fica sem resposta hoje?",
      site_e_atenda: "Oi, tudo bem? Sou o {meu_nome}, da {minha_empresa}, aqui de {cidade}. Procurei {nome} no Google e vi duas coisas: a empresa {falta_no_site} e {horario_curto}. Posso te mostrar como resolver as duas?",
    },
    segundo: "Oi de novo! Só para mostrar como seria: um atendente com IA responde quem chama vocês no WhatsApp em segundos, até de noite, e passa para vocês quando precisa. Quer ver funcionando?",
    terceiro: "Vou parar por aqui para não incomodar. Se um dia fizer sentido melhorar o site ou o WhatsApp de vocês, é só me chamar.",
  },
  tetoDiario: TETO_MAXIMO_DIARIO,
  pausaMinutos: PAUSA_PROVISORIA_MINUTOS,
  janela: JANELA_PROVISORIA,
  baseLegalRef: "Avaliação de exemplo (preview, a de verdade é sua)",
  ativa: true,
};

/** As conexões que aparecem no campo "Número que envia" (uma por empresa; de mentira). */
export const CONEXOES_DE_MENTIRA: ConexaoDisponivel[] = [
  { id: "obs", nome: "OBS", conectado: true, enviadasHoje: 1 },
  { id: "loja-teste", nome: "Loja Teste", conectado: false, enviadasHoje: 0 },
];
