import type { OpcoesDaBusca } from "./prospeccao";

/** One place row normalized before SQL (`prospeccao_concluir_busca`). */
export interface ItemDaFonteDeLeads {
  telefone: string | null;
  telefone_original: string | null;
  tipo_telefone: "celular" | "fixo" | "invalido" | null;
  fonte_id: string | null;
  nome: string;
  segmento: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  site: string | null;
  site_classe: "sim" | "so_rede_social" | "nao";
  nota: number | null;
  avaliacoes: number | null;
  pontuacao: number;
}

export interface InicioDaBusca {
  fonte: string;
  execucaoId: string;
}

/** Pure contract; server implementations live in `lib/fonte-apify.ts`. */
export interface FonteDeLeads {
  readonly id: string;
  iniciar(buscaId: string, opcoes: OpcoesDaBusca, webhookUrl: string): Promise<InicioDaBusca>;
  lerDataset(execucaoId: string): Promise<unknown[]>;
  mapearItem(bruto: unknown, termo: string): ItemDaFonteDeLeads;
}
