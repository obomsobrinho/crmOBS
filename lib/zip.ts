import { constants, deflateRawSync } from "node:zlib";

// ZIP EM FLUXO, SEM BIBLIOTECA (exportacao LGPD da central do dono, entrega 2).
//
// Cada arquivo entra em pedacos (lotes de CSV) e sai comprimido pedaco a pedaco:
// cada pedaco e um bloco deflate fechado com SYNC_FLUSH (sem dicionario entre um e
// outro, entao a concatenacao e um fluxo deflate valido) e o arquivo termina com o
// bloco final vazio. O tamanho e o CRC so existem no fim, entao vao no "data
// descriptor" (bit 3) e no diretorio central. Memoria: um pedaco por vez, mais uma
// linha de diretorio por arquivo.
//
// Sem ZIP64: mais de 4 GB num arquivo, no total, ou mais de 65.535 arquivos e
// erro (a exportacao de um cliente esta muito longe disso; se chegar, o erro diz).

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (o do ZIP), continuando de `anterior`. */
export function crc32(dados: Uint8Array, anterior = 0): number {
  let c = ~anterior >>> 0;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export interface ArquivoDoZip {
  nome: string;
  partes: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>;
}

const LIMITE_32 = 0xffffffff;
const UTF8 = new TextEncoder();

function dataDos(d: Date): { hora: number; data: number } {
  return {
    hora: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    data: ((Math.max(1980, d.getUTCFullYear()) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function cabecalho(tamanho: number, escrever: (v: DataView) => void): Uint8Array {
  const b = new Uint8Array(tamanho);
  escrever(new DataView(b.buffer));
  return b;
}

function confere(n: number, o: string): number {
  if (n > LIMITE_32) throw new Error(`zip: ${o} passou de 4 GB (sem ZIP64)`);
  return n;
}

interface Entrada {
  nome: Uint8Array;
  crc: number;
  comprimido: number;
  original: number;
  deslocamento: number;
}

/**
 * O ZIP inteiro, em pedacos, na ordem dos arquivos. Bit 11 (nomes em UTF-8) e
 * bit 3 (tamanho e CRC depois dos dados) ligados em todo arquivo.
 */
export async function* zipEmPartes(
  arquivos: AsyncIterable<ArquivoDoZip> | Iterable<ArquivoDoZip>,
  quando: Date = new Date()
): AsyncGenerator<Uint8Array> {
  const { hora, data } = dataDos(quando);
  const FLAGS = 0x0808;
  const entradas: Entrada[] = [];
  let pos = 0;

  for await (const arq of arquivos) {
    const nome = UTF8.encode(arq.nome);
    const deslocamento = confere(pos, "o arquivo");
    const local = cabecalho(30 + nome.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, FLAGS, true);
      v.setUint16(8, 8, true);
      v.setUint16(10, hora, true);
      v.setUint16(12, data, true);
      v.setUint16(26, nome.length, true);
    });
    local.set(nome, 30);
    yield local;
    pos += local.length;

    let crc = 0;
    let original = 0;
    let comprimido = 0;
    for await (const parte of arq.partes) {
      const bruto = typeof parte === "string" ? UTF8.encode(parte) : parte;
      if (bruto.length === 0) continue;
      crc = crc32(bruto, crc);
      original += bruto.length;
      const bloco = deflateRawSync(bruto, { finishFlush: constants.Z_SYNC_FLUSH });
      comprimido += bloco.length;
      pos += bloco.length;
      yield bloco;
    }
    const fim = deflateRawSync(Buffer.alloc(0));
    comprimido += fim.length;
    pos += fim.length;
    yield fim;

    const descritor = cabecalho(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc, true);
      v.setUint32(8, confere(comprimido, arq.nome), true);
      v.setUint32(12, confere(original, arq.nome), true);
    });
    yield descritor;
    pos += descritor.length;
    entradas.push({ nome, crc, comprimido, original, deslocamento });
  }

  if (entradas.length > 0xffff) throw new Error("zip: mais de 65.535 arquivos (sem ZIP64)");
  const inicioDoDiretorio = confere(pos, "o diretório");
  let tamanhoDoDiretorio = 0;
  for (const e of entradas) {
    const central = cabecalho(46 + e.nome.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, FLAGS, true);
      v.setUint16(10, 8, true);
      v.setUint16(12, hora, true);
      v.setUint16(14, data, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.comprimido, true);
      v.setUint32(24, e.original, true);
      v.setUint16(28, e.nome.length, true);
      v.setUint32(42, e.deslocamento, true);
    });
    central.set(e.nome, 46);
    tamanhoDoDiretorio += central.length;
    yield central;
  }
  yield cabecalho(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entradas.length, true);
    v.setUint16(10, entradas.length, true);
    v.setUint32(12, confere(tamanhoDoDiretorio, "o diretório"), true);
    v.setUint32(16, inicioDoDiretorio, true);
  });
}

/** O gerador vira o corpo de uma `Response`, puxado sob demanda (o navegador dita o ritmo). */
export function fluxoDe(partes: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      try {
        const { value, done } = await partes.next();
        if (done) ctl.close();
        else ctl.enqueue(value);
      } catch (e) {
        ctl.error(e);
      }
    },
    async cancel() {
      await partes.return(undefined);
    },
  });
}
