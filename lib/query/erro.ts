/**
 * O erro único das chamadas do navegador às rotas do app
 * (docs/plano-dados-e-estado.md, 2.9). Toda fonte LANÇA um `ErroDaApi` quando a
 * rota falha; nunca devolve o erro como valor. Assim o 401 chega ao tratador
 * global do cliente de dados e o desfazer de uma escrita mora só no `onError`.
 *
 * O formato que as rotas respondem é o status HTTP mais `{ error, codigo? }`:
 * `error` é a frase que a tela mostra, `codigo` é o motivo para a máquina.
 */
export class ErroDaApi extends Error {
  readonly status: number;
  readonly codigo: string | null;

  constructor(status: number, frase: string, codigo: string | null = null) {
    super(frase);
    this.name = "ErroDaApi";
    this.status = status;
    this.codigo = codigo;
  }
}

/** Frase quando a rota não disse nada (rede caiu, resposta sem corpo). */
export const FRASE_SEM_RESPOSTA = "Não foi possível falar com o servidor. Tente de novo.";

/** Lê o corpo de erro no formato do app (`{ error, codigo? }`), tolerando os formatos antigos. */
export async function erroDaResposta(res: Response): Promise<ErroDaApi> {
  let frase = "";
  let codigo: string | null = null;
  try {
    const corpo = (await res.json()) as Record<string, unknown>;
    // `error` é o formato único; `erro` é o antigo (`{ ok: false, erro }`), que
    // converge área por área.
    const f = corpo.error ?? corpo.erro;
    if (typeof f === "string") frase = f;
    if (typeof corpo.codigo === "string") codigo = corpo.codigo;
  } catch {
    // corpo vazio ou não JSON: fica a frase padrão
  }
  return new ErroDaApi(res.status, frase || FRASE_SEM_RESPOSTA, codigo);
}

/**
 * Repetir só faz sentido em erro de rede ou 5xx. 401, 403 e 404 não mudam
 * sozinhos: repetir só atrasa a resposta (2.4).
 */
export function valeRepetir(erro: unknown): boolean {
  if (erro instanceof ErroDaApi) return erro.status >= 500;
  return true; // falha de rede (TypeError do fetch) ou erro desconhecido
}
