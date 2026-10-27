"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diaIsoSP, diaMesCurtoHoraSP } from "@/lib/fuso";
import { cn } from "@/lib/utils";
import { urlAssinadaDaMidia, urlGuardadaDaMidia, urlParaBaixar } from "@/lib/midia-url";
import { usePaginada } from "@/lib/use-paginada";
import { useCanalConversa } from "@/lib/use-canal-ao-vivo";
import {
  ABAS_DE_ARQUIVO,
  TIPOS_DE_ARQUIVO,
  abaInicial,
  arquivoDaLinha,
  ehPdf,
  ehTipoDeArquivo,
  nomeParaBaixar,
  ordenarArquivos,
  rotuloDoTipo,
  type ArquivoDoContato,
  type LinhaDeArquivo,
  type TipoDeArquivo,
} from "@/lib/arquivos";
import {
  PAGINA_ARQUIVOS,
  buscarArquivos,
  contarArquivos,
  type ParamsArquivos,
} from "@/lib/arquivos-fonte";
import { CabecalhoBloco } from "./ContactFields";

// ARQUIVOS DO CONTATO (27/10/2026, pedido do dono): as imagens, os vídeos e os
// documentos que a pessoa mandou, para ninguém precisar rolar a conversa atrás
// de um RG ou de um comprovante.
//
// ⚠️ UMA ABA POR TIPO (segunda rodada, 27/10/2026, dono: "misturado e feio").
// A primeira versão punha miniaturas e linhas de documento na mesma pilha, e a
// coluna lia como um bloco só. Agora: Imagens e Vídeos em grade de miniaturas,
// Documentos em lista com nome, tipo e data; cada aba com a contagem. As abas
// são as do Painel (`variant="painel"`), o padrão da casa para trocar a vista.
//
// Carregamento: a contagem são três HEAD (`contarArquivos`); cada aba busca 10
// por vez SÓ quando é aberta (o Radix desmonta a aba fechada). Realtime: o canal
// `chat_messages` DESTE telefone; a linha nova com arquivo soma na contagem e
// entra na aba dela, sem reler nada.

/** Preview `/design` e caminhos antigos: URL que já serve como está. */
const URL_DIRETA = /^(https?:|data:|\/)/;

function useUrlDaMidia(caminho: string): string | null {
  const direta = URL_DIRETA.test(caminho);
  const [url, setUrl] = useState<string | null>(direta ? caminho : urlGuardadaDaMidia(caminho));
  useEffect(() => {
    if (direta) return;
    let cancelado = false;
    void urlAssinadaDaMidia(caminho).then((u) => {
      if (!cancelado) setUrl(u);
    });
    return () => {
      cancelado = true;
    };
  }, [caminho, direta]);
  return url;
}

type Contagem = Record<TipoDeArquivo, number>;

function contagemDe(lista: ArquivoDoContato[]): Contagem {
  const c: Contagem = { image: 0, video: 0, document: 0 };
  for (const a of lista) c[a.tipo] += 1;
  return c;
}

export default function ContactArquivos({
  clientId,
  phone,
  preview,
}: {
  clientId: string;
  phone: string;
  /** Só o preview `/design`: a lista pronta, sem banco nem realtime. */
  preview?: ArquivoDoContato[];
}) {
  const vivo = !preview && !!clientId;
  const [contagem, setContagem] = useState<Contagem | null>(preview ? contagemDe(preview) : null);
  const [escolhida, setEscolhida] = useState<TipoDeArquivo | null>(null);
  // O que chegou pelo realtime desde a montagem; cada aba encaixa o que é dela.
  const [novos, setNovos] = useState<ArquivoDoContato[]>([]);
  const [aberto, setAberto] = useState<ArquivoDoContato | null>(null);

  const contar = useCallback(async () => {
    try {
      setContagem(await contarArquivos({ clientId, phone }));
    } catch (e) {
      console.error("contagem de arquivos:", e);
    }
  }, [clientId, phone]);

  useEffect(() => {
    if (!vivo) return;
    void (async () => {
      await contar();
    })();
  }, [vivo, contar]);

  useCanalConversa({
    nome: "ficha-arquivos",
    tabela: "chat_messages",
    filtro: `phone=eq.${phone}`,
    modo: "aplicar",
    ativo: vivo,
    revalidar: () => void contar(),
    aoEvento: (ev) => {
      // Só a linha NOVA conta: o n8n grava a mensagem já com o arquivo, e um
      // UPDATE de outra coluna somaria a mesma linha duas vezes.
      if (ev.tipo !== "INSERT" || !ev.novo || ev.novo.client_id !== clientId) return;
      const novo = arquivoDaLinha(ev.novo as LinhaDeArquivo);
      if (!novo) return;
      setNovos((cur) => (cur.some((a) => a.id === novo.id) ? cur : [...cur, novo]));
      setContagem((c) => (c ? { ...c, [novo.tipo]: c[novo.tipo] + 1 } : c));
    },
  });

  const aba = escolhida ?? abaInicial(contagem);

  return (
    <div data-slot="painel-arquivos" className="flex flex-col gap-2.5 px-4 pt-4">
      <CabecalhoBloco rotulo="Arquivos" />

      <Tabs
        value={aba}
        onValueChange={(v) => {
          if (ehTipoDeArquivo(v)) setEscolhida(v);
        }}
      >
        <TabsList
          variant="painel"
          aria-label="Tipo de arquivo"
          className="w-full bg-canvas"
        >
          {TIPOS_DE_ARQUIVO.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              variant="painel"
              data-arquivo-aba={t}
              // ⚠️ Era `grid-cols-3` (três células iguais) numa coluna de ~260px:
              // "Documentos 2" pedia 85px numa célula de 84, e a pílula ativa
              // vazava pela borda da trilha (achado do dono, 27/10/2026); cortar o
              // rótulo ("Documen…") foi pior. Agora `flex-auto`: cada aba ocupa o
              // próprio texto mais a MESMA sobra, então o respiro em volta do
              // rótulo é igual nas três e a pílula ativa nunca encosta na borda.
              className="flex-auto justify-center gap-1 whitespace-nowrap px-1 py-1 text-legenda"
            >
              <span>{ABAS_DE_ARQUIVO[t].rotulo}</span>
              <span className="shrink-0 tabular-nums text-ink-3" data-arquivo-contagem>
                {contagem ? contagem[t] : "·"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TIPOS_DE_ARQUIVO.map((t) => (
          <TabsContent key={t} value={t} className="pt-2.5">
            <ListaDoTipo
              tipo={t}
              clientId={clientId}
              phone={phone}
              preview={preview?.filter((a) => a.tipo === t)}
              novos={novos}
              onAbrir={setAberto}
            />
          </TabsContent>
        ))}
      </Tabs>

      <PreviaDoArquivo arquivo={aberto} onFechar={() => setAberto(null)} />
    </div>
  );
}

function ListaDoTipo({
  tipo,
  clientId,
  phone,
  preview,
  novos,
  onAbrir,
}: {
  tipo: TipoDeArquivo;
  clientId: string;
  phone: string;
  preview?: ArquivoDoContato[];
  novos: ArquivoDoContato[];
  onAbrir: (a: ArquivoDoContato) => void;
}) {
  const vivo = !preview && !!clientId;
  const params = useMemo<ParamsArquivos>(() => ({ clientId, phone, tipo }), [clientId, phone, tipo]);
  // Identidade estável: `usePaginada` troca a lista quando `inicial` muda.
  const [inicial] = useState<ArquivoDoContato[]>(() => preview ?? []);
  const { itens, temMais, carregando, fimRef, revalidar } = usePaginada<
    ArquivoDoContato,
    ParamsArquivos
  >({
    inicial,
    temMaisInicial: false,
    params,
    // No preview a "busca" devolve a própria lista: o modo estrito do React
    // repete o efeito de montagem do `usePaginada` em dev, e sem banco essa
    // segunda volta virava um 42501 no console.
    buscar: preview ? async () => inicial : buscarArquivos,
    chave: (a) => a.id,
    tamanho: PAGINA_ARQUIVOS,
    revalidarAoVoltar: false,
  });
  const [carregou, setCarregou] = useState(!vivo);

  // A aba nasce no navegador (não há primeira página do servidor): busca a
  // primeira página ao abrir.
  useEffect(() => {
    if (!vivo) return;
    let cancelado = false;
    void revalidar(PAGINA_ARQUIVOS).then(() => {
      if (!cancelado) setCarregou(true);
    });
    return () => {
      cancelado = true;
    };
  }, [vivo, revalidar]);

  // O que o realtime trouxe e é desta aba entra no topo (na hora de desenhar,
  // sem regravar a página: uma revalidação depois já o traz pelo banco).
  const lista = useMemo(() => {
    const faltam = novos.filter((a) => a.tipo === tipo && !itens.some((c) => c.id === a.id));
    return faltam.length ? ordenarArquivos([...faltam, ...itens]) : itens;
  }, [novos, tipo, itens]);

  if (carregou && lista.length === 0) {
    return (
      <span className="text-apoio text-ink-3" style={{ textWrap: "pretty" }}>
        {ABAS_DE_ARQUIVO[tipo].vazio}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tipo === "document" ? (
        <ul className="-mx-2 flex flex-col">
          {lista.map((a) => (
            <li key={a.id}>
              <LinhaDoDocumento arquivo={a} onAbrir={() => onAbrir(a)} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5">
          {lista.map((a) => (
            <li key={a.id}>
              <Miniatura arquivo={a} onAbrir={() => onAbrir(a)} />
            </li>
          ))}
        </ul>
      )}
      {temMais && <span ref={fimRef} aria-hidden className="h-px" />}
      {carregando && (
        <span className="text-legenda text-ink-3">
          {lista.length ? "Carregando mais…" : "Carregando…"}
        </span>
      )}
    </div>
  );
}

function Miniatura({ arquivo, onAbrir }: { arquivo: ArquivoDoContato; onAbrir: () => void }) {
  const url = useUrlDaMidia(arquivo.caminho);
  const video = arquivo.tipo === "video";
  return (
    <Button
      data-arquivo={video ? "video" : "imagem"}
      variant="nu"
      size="none"
      onClick={onAbrir}
      aria-label={`Ver ${video ? "vídeo" : "imagem"} de ${diaMesCurtoHoraSP(arquivo.criadoEm)}`}
      className="relative aspect-square w-full overflow-hidden rounded-lg border border-line-soft bg-bloco transition-opacity hover:opacity-85"
    >
      {url &&
        (video ? (
          // O primeiro quadro como miniatura: `#t=0.1` faz o navegador desenhar
          // um quadro sem tocar, e `metadata` baixa só o cabeçalho.
          <video
            src={`${url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, fora do otimizador
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ))}
      {video && (
        <span
          aria-hidden
          className="absolute inset-0 m-auto flex h-8 w-8 items-center justify-center rounded-full bg-raised/85 text-ink shadow-[var(--panel-shadow)]"
        >
          <Play size={14} className="translate-x-px" />
        </span>
      )}
    </Button>
  );
}

function LinhaDoDocumento({ arquivo, onAbrir }: { arquivo: ArquivoDoContato; onAbrir: () => void }) {
  const tipo = rotuloDoTipo(arquivo);
  return (
    <Button
      data-arquivo="documento"
      variant="linha"
      size="linha"
      onClick={onAbrir}
      className="w-full gap-2.5 px-2"
    >
      {/* O tipo escrito no ícone (PDF, DOCX): é o que distingue um papel do
          outro numa lista de nomes parecidos. */}
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-px rounded-lg border border-line-soft bg-bloco text-ink-2"
      >
        <FileText size={14} />
        <span className="max-w-full truncate px-0.5 text-[10px] font-semibold leading-none tracking-wide">
          {tipo === "Arquivo" ? "" : tipo}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-apoio font-medium text-ink">{arquivo.nome ?? "Documento"}</span>
        <span className="truncate text-legenda text-ink-3" suppressHydrationWarning>
          {tipo} · {diaMesCurtoHoraSP(arquivo.criadoEm)}
        </span>
      </span>
    </Button>
  );
}

function PreviaDoArquivo({
  arquivo,
  onFechar,
}: {
  arquivo: ArquivoDoContato | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!arquivo} onOpenChange={(v) => !v && onFechar()}>
      {arquivo && (
        <DialogContent tamanho="midia" data-arquivo-previa="">
          <ConteudoDaPrevia arquivo={arquivo} />
        </DialogContent>
      )}
    </Dialog>
  );
}

const TITULO_SEM_NOME: Record<TipoDeArquivo, string> = {
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
};

function ConteudoDaPrevia({ arquivo }: { arquivo: ArquivoDoContato }) {
  const url = useUrlDaMidia(arquivo.caminho);
  const direta = URL_DIRETA.test(arquivo.caminho);
  const nome = nomeParaBaixar(arquivo, diaIsoSP(Date.parse(arquivo.criadoEm)));
  const [urlBaixar, setUrlBaixar] = useState<string | null>(direta ? arquivo.caminho : null);
  useEffect(() => {
    if (direta) return;
    let cancelado = false;
    void urlParaBaixar(arquivo.caminho, nome).then((u) => {
      if (!cancelado) setUrlBaixar(u);
    });
    return () => {
      cancelado = true;
    };
  }, [arquivo.caminho, nome, direta]);

  const titulo = arquivo.nome ?? TITULO_SEM_NOME[arquivo.tipo];
  const pdf = ehPdf(arquivo);

  return (
    <>
      <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DialogTitle className="truncate text-cartao">{titulo}</DialogTitle>
          <DialogDescription suppressHydrationWarning>
            {arquivo.tipo === "document" ? `${rotuloDoTipo(arquivo)} · ` : ""}
            Recebido em {diaMesCurtoHoraSP(arquivo.criadoEm)}
          </DialogDescription>
        </div>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-control" aria-label="Fechar">
            <X size={18} />
          </Button>
        </DialogClose>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-bloco">
        {!url ? (
          <span className="text-apoio text-ink-3">Carregando…</span>
        ) : arquivo.tipo === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, fora do otimizador
          <img src={url} alt="Imagem enviada pelo contato" className="max-h-full max-w-full object-contain" />
        ) : arquivo.tipo === "video" ? (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            data-arquivo-video=""
            className="max-h-full max-w-full"
          />
        ) : pdf ? (
          <>
            {/* O celular não desenha PDF dentro da página (o Android baixa, o
                iPhone mostra só a primeira folha): lá a prévia é a aba nova. */}
            <iframe src={url} title={titulo} data-arquivo-pdf="" className="h-full w-full max-md:hidden" />
            <SemPrevia className="md:hidden" texto="Toque em Abrir para ver o PDF." />
          </>
        ) : (
          <SemPrevia texto="Este tipo de arquivo não tem prévia. Abra ou baixe para ver." />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3">
        {url && (
          <Button asChild variant="outline" data-arquivo-acao="abrir">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
              Abrir em nova aba
            </a>
          </Button>
        )}
        {urlBaixar && (
          <Button asChild variant="brand" data-arquivo-acao="baixar">
            <a href={urlBaixar} download={nome}>
              <Download size={15} />
              Baixar
            </a>
          </Button>
        )}
      </div>
    </>
  );
}

function SemPrevia({ texto, className }: { texto: string; className?: string }) {
  return (
    <span className={cn("flex flex-col items-center gap-2 px-6 text-center text-apoio text-ink-2", className)}>
      <FileText size={28} className="text-ink-3" />
      {texto}
    </span>
  );
}
