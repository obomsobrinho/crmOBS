// Modelos de configuração do agente por segmento. Ponto de partida: o tenant
// escolhe o mais próximo do negócio dele e ajusta os campos. Não é um prompt
// pronto, é um preenchimento inicial do AgentConfig (o mesmo shape do formulário
// guiado). companyName e agentName ficam vazios de propósito: são a identidade
// do cliente, que ele preenche. O resto (tom, objetivos, regras, esqueleto dos
// detalhes) vem calibrado para o segmento.
//
// MÓDULO PURO (sem server-only / env / supabase), igual a lib/agent-prompt.ts:
// o formulário e o /design importam daqui direto.

import { EMPTY_CONFIG, DEFAULT_HOURS, type AgentConfig } from "@/lib/agent-prompt";

export interface AgentPreset {
  id: string;
  label: string;
  /** Uma linha, aparece no seletor. */
  description: string;
  config: AgentConfig;
}

// Helper: parte do EMPTY_CONFIG e sobrescreve só o que muda por segmento.
function preset(over: Partial<AgentConfig>): AgentConfig {
  return { ...EMPTY_CONFIG, hours: DEFAULT_HOURS, ...over };
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "advocacia",
    label: "Advocacia",
    description: "Escritório de advocacia, atendimento e triagem de casos.",
    config: preset({
      companyWhat: "presta serviços de advocacia e orientação jurídica.",
      tone: "profissional",
      goals: ["duvidas", "qualificar", "agendar"],
      dontDo: [
        "nunca dar parecer ou orientação jurídica pelo WhatsApp",
        "nunca prometer resultado de processo",
        "nunca combinar valor de honorário por conta própria",
      ],
      escalateWhen: [
        "quando pedirem análise de um caso ou de um documento",
        "quando quiserem falar de valores e contratação",
      ],
      details:
        "Áreas de atuação:\n\nComo funciona a primeira conversa com o advogado:\n\nDocumentos que a pessoa costuma precisar levar:\n\nFormas de pagamento:",
    }),
  },
  {
    id: "odontologia",
    label: "Clínica odontológica",
    description: "Consultório ou clínica de odontologia.",
    config: preset({
      companyWhat: "é uma clínica odontológica.",
      tone: "amigavel",
      goals: ["duvidas", "qualificar", "agendar"],
      dontDo: [
        "nunca dar diagnóstico ou orientação clínica pelo WhatsApp",
        "nunca prometer resultado de tratamento",
        "nunca passar preço fechado sem avaliação",
      ],
      escalateWhen: [
        "quando a pessoa descrever dor forte, inchaço ou urgência",
        "quando pedirem orçamento de um tratamento",
      ],
      details:
        "Tratamentos e especialidades:\n\nConvênios aceitos:\n\nComo funciona a primeira avaliação:\n\nFormas de pagamento e parcelamento:",
    }),
  },
  {
    id: "pediatria",
    label: "Pediatria",
    description: "Consultório ou clínica pediátrica.",
    config: preset({
      companyWhat: "é um consultório de pediatria.",
      tone: "amigavel",
      goals: ["duvidas", "qualificar", "agendar"],
      // Pediatria é o segmento em que responder demais custa mais caro: quem
      // escreve está com uma criança doente do outro lado, e uma frase
      // tranquilizadora errada atrasa atendimento. Por isso os limites aqui
      // fecham em volta de sintoma, remédio e gravidade, e não só de preço.
      dontDo: [
        "nunca dar diagnóstico ou orientação clínica pelo WhatsApp",
        "nunca indicar remédio, dose ou horário de remédio",
        "nunca dizer se um sintoma é grave ou se pode esperar",
      ],
      escalateWhen: [
        "quando descreverem febre, dificuldade para respirar ou qualquer sinal de urgência",
        "quando perguntarem sobre um sintoma ou sobre um remédio",
        "quando pedirem orçamento ou perguntarem de convênio",
      ],
      details:
        "Faixa etária atendida:\n\nConvênios aceitos:\n\nComo funciona a primeira consulta:\n\nO que levar no dia:\n\nFormas de pagamento:",
    }),
  },
  {
    id: "engenharia",
    label: "Engenharia e projetos",
    description: "Escritório de engenharia, projetos e acompanhamento de obra.",
    config: preset({
      companyWhat: "presta serviços de engenharia e projetos.",
      tone: "profissional",
      goals: ["duvidas", "qualificar", "agendar"],
      dontDo: [
        "nunca estimar prazo ou valor de um projeto por conta própria",
        "nunca opinar sobre viabilidade técnica sem uma visita",
        "nunca prometer aprovação em órgão público",
      ],
      escalateWhen: [
        "quando pedirem orçamento ou proposta",
        "quando descreverem um problema estrutural ou um risco na obra",
      ],
      details:
        "Serviços e tipos de projeto:\n\nRegiões atendidas:\n\nComo funciona a primeira visita ou reunião:\n\nDocumentos que costumam ser necessários:\n\nComo é feita a proposta:",
    }),
  },
  {
    id: "estetica",
    label: "Clínica de estética",
    description: "Estética facial e corporal, procedimentos e pacotes.",
    config: preset({
      companyWhat: "é uma clínica de estética e cuidados com a pele.",
      tone: "amigavel",
      goals: ["duvidas", "qualificar", "agendar"],
      dontDo: [
        "nunca prometer resultado garantido",
        "nunca indicar procedimento sem uma avaliação",
        "nunca passar preço fechado sem avaliação",
      ],
      escalateWhen: [
        "quando perguntarem sobre contraindicação ou reação",
        "quando quiserem fechar um pacote ou orçamento",
      ],
      details:
        "Procedimentos oferecidos:\n\nComo funciona a avaliação inicial:\n\nCuidados antes e depois (o que pode adiantar):\n\nFormas de pagamento e pacotes:",
    }),
  },
  {
    id: "restaurante",
    label: "Restaurante ou pizzaria",
    description: "Salão, retirada e entrega. Sem marcação de horário.",
    config: preset({
      companyWhat: "é um restaurante que atende no salão, para retirada e entrega.",
      tone: "descontraido",
      goals: ["duvidas", "qualificar"],
      dontDo: [
        "nunca confirmar um pedido ou uma entrega por conta própria",
        "nunca inventar tempo de entrega ou de espera",
      ],
      escalateWhen: [
        "quando a pessoa quiser fechar um pedido",
        "quando reclamarem de um pedido ou de uma entrega",
      ],
      details:
        "Cardápio e itens principais:\n\nRegião e taxa de entrega:\n\nTempo médio de entrega e de retirada:\n\nFormas de pagamento:",
    }),
  },
  {
    id: "varejo",
    label: "Loja ou varejo",
    description: "Loja de produtos, dúvidas e encaminhamento de vendas.",
    config: preset({
      companyWhat: "é uma loja de varejo.",
      tone: "profissional",
      goals: ["duvidas", "qualificar"],
      dontDo: [
        "nunca inventar disponibilidade ou estoque de um produto",
        "nunca dar desconto por conta própria",
      ],
      escalateWhen: [
        "quando a pessoa quiser comprar ou reservar um produto",
        "quando perguntarem sobre troca, garantia ou defeito",
      ],
      details:
        "O que a loja vende:\n\nComo funciona a entrega ou a retirada:\n\nTroca e garantia:\n\nFormas de pagamento:",
    }),
  },
  {
    id: "imobiliaria",
    label: "Imobiliária",
    description: "Compra, venda e locação de imóveis, com visita.",
    config: preset({
      companyWhat: "trabalha com compra, venda e locação de imóveis.",
      tone: "profissional",
      goals: ["duvidas", "qualificar", "agendar"],
      dontDo: [
        "nunca inventar valor, condição ou disponibilidade de um imóvel",
        "nunca prometer aprovação de financiamento",
      ],
      escalateWhen: [
        "quando quiserem visitar um imóvel",
        "quando pedirem proposta, negociação ou documentação",
      ],
      details:
        "Tipos de imóvel e regiões de atuação:\n\nComo funciona uma visita:\n\nDocumentos para locação e para compra:\n\nComo é feita a proposta:",
    }),
  },
  {
    id: "salao",
    label: "Salão de beleza ou barbearia",
    description: "Cabelo, unhas e estética rápida, com horário.",
    config: preset({
      companyWhat: "é um salão de beleza.",
      tone: "amigavel",
      goals: ["duvidas", "qualificar", "agendar"],
      dontDo: [
        "nunca confirmar um horário sem passar pro time",
        "nunca prometer um resultado específico",
      ],
      escalateWhen: [
        "quando a pessoa quiser marcar um horário",
        "quando perguntarem sobre química ou um procedimento específico",
      ],
      details:
        "Serviços e profissionais:\n\nTempo médio de cada serviço:\n\nComo funciona a marcação:\n\nFormas de pagamento:",
    }),
  },
];
