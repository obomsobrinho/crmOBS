"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search, UsersRound, X } from "lucide-react";
import NovoClienteDialog from "@/components/NovoClienteDialog";
import AvatarContato from "@/components/AvatarContato";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AreaRolavel,
  DISSOLVER_LISTA,
} from "@/components/ui/dissolver-rolagem";
import { cn } from "@/lib/utils";
import { formatTime, prettyPhone } from "@/lib/format";
import { quemAtende, tagColor } from "@/lib/crm";
import { agoraMs } from "@/lib/periodo";
import { createClient } from "@/lib/supabase/client";
import { foraDaLista } from "@/lib/inbox-lista";
import { useDebounce } from "@/lib/use-debounce";
import { usePaginada } from "@/lib/use-paginada";
import {
  PAGINA_CLIENTES,
  fonteClientesDaMemoria,
  fonteClientesDoBanco,
  paramsClientes,
  type ContagensClientes,
  type FonteClientes,
  type ParamsClientes,
} from "@/lib/clientes-fonte";
import {
  DADOS_DO_CADASTRO,
  LIMIAR_FRIO_DIAS,
  ROTULO_FILTRO,
  diasSemContato,
  emConversa,
  preenchidos,
  textoUltimoContato,
  type ClienteItem,
  type FiltroClientes,
} from "@/lib/clientes";

// LISTA DE CLIENTES (30/09/2026, docs/plano-clientes.md; paginada em 01/10/2026,
// docs/plano-carregamento.md, fase 3).
//
// 10 por vez, mais ao rolar. Busca (com debounce) e filtros rodam no BANCO
// (`clientes_pagina`), com a mesma regra de `casaBusca`/`passaFiltro`; as
// contagens dos chips também (`clientes_contagens`). Antes a tela baixava até
// 2.000 contatos com todas as conversas e todas as tags para filtrar aqui.
//
// ⚠️ Sem realtime: a lista revalida ao voltar o foco (no máximo a cada 10s), a
// mesma regra das outras telas.
export default function ListaClientes({
  inicial,
  clientId,
  previewTodos,
  numeroAvisos = null,
  selecionadoId = null,
  hrefModelo = "/clientes/{id}",
  podeCadastrar = true,
  simular = false,
}: {
  /** A primeira página e as contagens, que o servidor já buscou. */
  inicial: { itens: ClienteItem[]; contagens: ContagensClientes; temMais: boolean };
  /** Tenant logado. Sem ele (preview /design) a lista roda sobre `previewTodos`. */
  clientId?: string;
  previewTodos?: ClienteItem[];
  /** Destino dos avisos: nunca é cliente (lib/avisos.ts). */
  numeroAvisos?: string | null;
  /** Conta bloqueada (modo leitura) não cadastra. */
  podeCadastrar?: boolean;
  /** Preview `/design/clientes`: o "Novo cliente" valida e não grava. */
  simular?: boolean;
  /** Para o preview `/design/clientes`, que não tem rota por contato. */
  selecionadoId?: number | null;
  /** Endereço de cada linha, com `{id}` no lugar do id. O preview troca. */
  hrefModelo?: string;
}) {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  // A busca vai ao SERVIDOR, e só depois de a pessoa parar de digitar.
  const busca = useDebounce(q.trim(), 300);
  const [filtro, setFiltro] = useState<FiltroClientes>("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  const abrirNovo = (telefone = "") => {
    setNovoTelefone(telefone);
    setNovoAberto(true);
  };
  const agora = useMemo(() => agoraMs(), []);
  const fora = useMemo(() => foraDaLista(numeroAvisos), [numeroAvisos]);

  const fonte = useMemo<FonteClientes>(
    () =>
      clientId
        ? fonteClientesDoBanco(createClient(), clientId)
        : fonteClientesDaMemoria(previewTodos ?? inicial.itens, agora),
    [clientId, previewTodos, inicial.itens, agora]
  );
  const params = useMemo(
    () => paramsClientes(filtro, busca, fora, agora),
    [filtro, busca, fora, agora]
  );

  const [contagem, setContagem] = useState<ContagensClientes>(inicial.contagens);
  const [contagemVista, setContagemVista] = useState(inicial.contagens);
  if (inicial.contagens !== contagemVista) {
    setContagemVista(inicial.contagens);
    setContagem(inicial.contagens);
  }
  const recontar = useCallback(() => {
    void fonte
      .contagens(params)
      .then(setContagem)
      .catch((e) => console.error("contagens de clientes:", e));
  }, [fonte, params]);

  const {
    itens,
    temMais,
    carregando,
    fimRef,
  } = usePaginada<ClienteItem, ParamsClientes>({
    inicial: inicial.itens,
    temMaisInicial: inicial.temMais,
    params,
    buscar: (p, depois, n) => fonte.pagina(p, depois, n),
    chave: (c) => c.id,
    tamanho: PAGINA_CLIENTES,
    revalidarAoVoltar: !!clientId,
    aoRevalidar: clientId ? recontar : undefined,
  });

  // No CELULAR, lista e ficha não dividem a tela: com uma ficha aberta a lista
  // some (por CSS, como a lista de conversas), e quem volta é o "voltar".
  const abertoPelaRota = pathname.match(/^\/clientes\/(\d+)/)?.[1];
  const ativo = selecionadoId ?? (abertoPelaRota ? Number(abertoPelaRota) : null);

  const linhas = itens;
  const temBusca = busca.length > 0;
  const chipsVisiveis = (Object.keys(ROTULO_FILTRO) as FiltroClientes[]).filter(
    (k) => k === "todos" || k === filtro || contagem[k] > 0
  );

  return (
    <Card
      asChild
      variant="pagina"
      className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden",
        ativo != null && "max-md:hidden"
      )}
    >
      <section aria-label="Clientes">
        <div className="border-b border-line px-4 pb-3 pt-4 md:px-5">
          <div className="flex items-center gap-2">
            <h1 className="text-titulo">Clientes</h1>
            <span
              data-slot="clientes-total"
              className="text-apoio font-semibold tabular-nums text-ink-3"
            >
              {contagem.todos}
            </span>
            {podeCadastrar && (
              <Button
                variant="outline"
                size="control"
                data-slot="clientes-novo"
                onClick={() => abrirNovo()}
                className="ml-auto"
              >
                <Plus size={14} />
                Novo cliente
              </Button>
            )}
          </div>

          <div className="mt-3 flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-2.5 transition-colors focus-within:border-brand-line md:max-w-[420px]">
            <Search size={15} className="shrink-0 text-ink-faint" />
            <Input
              variant="limpo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, telefone ou dado"
              aria-label="Buscar clientes"
              className="text-apoio"
            />
            {temBusca && (
              <Button
                variant="ghost"
                size="none"
                onClick={() => setQ("")}
                aria-label="Limpar busca"
                className="rounded-sm text-ink-3"
              >
                <X size={14} />
              </Button>
            )}
          </div>

          {/* A MESMA regra da lista de conversas (D4, 30/09/2026): chip com zero
              some, menos "Todos" e o que estiver ligado; com um chip só, a faixa
              inteira some. */}
          {chipsVisiveis.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chipsVisiveis.map((k) => {
              const on = filtro === k;
              return (
                <Button
                  key={k}
                  variant="outline"
                  size="chrome"
                  data-slot="clientes-chip"
                  data-ativo={on ? "sim" : undefined}
                  aria-pressed={on}
                  onClick={() => setFiltro(k)}
                  className={cn(
                    "shrink-0 gap-1.5 rounded-md px-2.5",
                    on
                      ? "border-[var(--chip-ativo-bg)] bg-[var(--chip-ativo-bg)] text-[var(--chip-ativo-fg)] hover:bg-[var(--chip-ativo-bg)]"
                      : "border-line bg-[var(--chip-bg)] text-ink-2 hover:bg-[var(--chip-bg)] hover:text-ink"
                  )}
                >
                  {ROTULO_FILTRO[k]}
                  <span className="font-bold tabular-nums opacity-75">{contagem[k]}</span>
                </Button>
              );
            })}
          </div>
          )}
        </div>

        {/* Cabeçalho das colunas: só no computador. No celular cada linha é um
            bloco só, com o último contato embaixo do nome. */}
        <div
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_150px_72px] gap-3 border-b border-line-soft px-5 py-2 text-rotulo uppercase text-ink-3 max-md:hidden xl:grid-cols-[minmax(0,1fr)_150px_minmax(0,180px)_72px]"
        >
          <span>Cliente</span>
          <span>Último contato</span>
          <span className="max-xl:hidden">Tags</span>
          <span className="text-right">Cadastro</span>
        </div>

        <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
          {contagem.todos === 0 && !carregando ? (
            <Vazio
              titulo="Ainda não há clientes"
              texto="Quem escrever para o seu WhatsApp aparece aqui sozinho, com telefone e nome."
            />
          ) : linhas.length === 0 && !carregando ? (
            temBusca ? (
              <Vazio
                titulo={`Nenhum cliente para “${busca}”`}
                texto="A busca olha nome, telefone, e-mail, tags e os campos que você criou."
              >
                {podeCadastrar && (
                  <Button
                    variant="outline"
                    size="control"
                    data-slot="clientes-vazio-novo"
                    className="mt-2"
                    onClick={() => abrirNovo(/\d{8,}/.test(q.replace(/\D/g, "")) ? q : "")}
                  >
                    <Plus size={14} />
                    Cadastrar novo cliente
                  </Button>
                )}
              </Vazio>
            ) : filtro === "conversa" ? (
              <Vazio
                titulo="Ninguém em conversa hoje"
                texto="Quem escrever hoje aparece aqui."
              />
            ) : filtro === "nunca" ? (
              <Vazio
                titulo="Todo mundo já escreveu"
                texto="Quem você cadastrar e ainda não tiver escrito aparece aqui."
              />
            ) : filtro === "frio" ? (
              <Vazio
                titulo="Ninguém esfriou"
                texto={`Nenhum cliente passou ${LIMIAR_FRIO_DIAS} dias sem falar com você.`}
              />
            ) : (
              <Vazio
                titulo="Todos os cadastros estão completos"
                texto="Nome, nascimento e e-mail preenchidos em todos."
              />
            )
          ) : (
            <ul data-slot="clientes-lista">
              {linhas.map((it) => (
                <Linha
                  key={it.id}
                  it={it}
                  agora={agora}
                  ativa={it.id === ativo}
                  href={hrefModelo.replace("{id}", String(it.id))}
                />
              ))}
              {/* O fim da lista: quando aparece, vem a próxima página. */}
              {temMais && (
                <li
                  ref={(el) => {
                    fimRef.current = el;
                  }}
                  data-slot="clientes-mais"
                  aria-hidden
                  className="h-px"
                />
              )}
              {carregando && (
                <li data-slot="clientes-carregando" className="px-5 py-3 text-legenda text-ink-3">
                  Carregando…
                </li>
              )}
            </ul>
          )}
        </AreaRolavel>
        <NovoClienteDialog
          aberto={novoAberto}
          onFechar={() => setNovoAberto(false)}
          telefoneInicial={novoTelefone}
          simular={simular}
        />
      </section>
    </Card>
  );
}

function Linha({
  it,
  agora,
  ativa,
  href,
}: {
  it: ClienteItem;
  agora: number;
  ativa: boolean;
  href: string;
}) {
  const hoje = emConversa(it.lastMessageAt, agora);
  const quem = quemAtende({ pausada: it.pausada, temAtendente: it.temAtendente });
  const cheios = preenchidos(it);
  const n = cheios.filter(Boolean).length;
  const titulo = it.name ?? prettyPhone(it.phone);

  const frio = diasSemContato(it.lastMessageAt, agora);
  const contato = !it.lastMessageAt
    ? { texto: "Nunca escreveu", sub: null }
    : frio != null
      ? { texto: `Sem contato há ${frio} dias`, sub: null }
      : hoje
      ? {
          texto: `Hoje, ${formatTime(it.lastMessageAt)}`,
          sub:
            quem === "ia"
              ? "IA atendendo"
              : quem === "pessoa"
                ? "Time atendendo"
                : "Ninguém atendendo",
        }
      : { texto: textoUltimoContato(it.lastMessageAt, agora), sub: null };

  return (
    <li>
      <Link
        href={href}
        data-slot="clientes-item"
        data-frio={frio != null ? "sim" : undefined}
        aria-current={ativa ? "page" : undefined}
        className={cn(
          "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft py-2.5 pl-4 pr-4 transition-colors duration-100 md:grid-cols-[minmax(0,1fr)_150px_72px] md:pl-5 md:pr-5 xl:grid-cols-[minmax(0,1fr)_150px_minmax(0,180px)_72px]",
          ativa ? "bg-[var(--sel-bg)]" : "hover:bg-[var(--active-bg)]"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            ativa ? "bg-[var(--sel-bar)]" : "bg-transparent"
          )}
        />
        <span className="flex min-w-0 items-center gap-2.5">
          <AvatarContato size="md" phone={it.phone} name={it.name} fotoPath={it.fotoPath} />
          <span className="flex min-w-0 flex-col gap-px">
            <span data-slot="clientes-nome" className="truncate text-corpo font-semibold text-ink">
              {titulo}
            </span>
            <span className="truncate text-legenda text-ink-3">
              {it.name ? prettyPhone(it.phone) : "Sem nome"}
            </span>
            {/* No celular o último contato ganha LINHA PRÓPRIA: colado ao
                telefone ele era cortado justo no número de dias, que é o que
                o contato frio existe para dizer. */}
            <span
              data-slot="clientes-contato-celular"
              className="truncate text-legenda text-ink-2 md:hidden"
              suppressHydrationWarning
            >
              {contato.texto}
            </span>
          </span>
        </span>

        <span className="flex min-w-0 flex-col gap-px max-md:hidden">
          <span
            className="flex items-center gap-1.5 truncate text-apoio text-ink-2"
            suppressHydrationWarning
          >
            {hoje && (
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  quem === "ia" ? "bg-brand-ink" : quem === "pessoa" ? "bg-human-ink" : "bg-ink-faint"
                )}
              />
            )}
            {contato.texto}
          </span>
          {contato.sub && (
            <span className="truncate text-legenda text-ink-3">{contato.sub}</span>
          )}
        </span>

        <span className="flex min-w-0 flex-wrap gap-1 max-xl:hidden">
          {it.tags.slice(0, 3).map((t) => (
            <span
              key={t.name}
              className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-line px-1.5 py-px text-legenda text-ink-2"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: tagColor(t.color ?? "gray") }}
              />
              <span className="truncate">{t.name}</span>
            </span>
          ))}
          {it.tags.length > 3 && (
            <span className="text-legenda text-ink-3">+{it.tags.length - 3}</span>
          )}
        </span>

        {/* O MEDIDOR DE CADASTRO: um traço por dado (Nome, Nascimento, E-mail).
            Convida sem cobrar: cinza cheio e cinza vazio, nunca cor de aviso. */}
        <span
          data-slot="clientes-medidor"
          title={n === 3 ? "Cadastro completo" : `${n} de 3 dados preenchidos`}
          aria-label={n === 3 ? "Cadastro completo" : `${n} de 3 dados preenchidos`}
          className="flex items-center justify-end gap-[3px]"
        >
          {cheios.map((on, i) => (
            <span
              key={DADOS_DO_CADASTRO[i]}
              className={cn("h-1.5 w-3 rounded-full", on ? "bg-ink-2" : "bg-[var(--line-strong)]")}
            />
          ))}
        </span>
      </Link>
    </li>
  );
}

function Vazio({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <div data-slot="clientes-vazio" className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <UsersRound size={28} className="text-ink-faint" />
      <p className="text-cartao text-ink">{titulo}</p>
      <p className="max-w-[360px] text-apoio text-ink-2" style={{ textWrap: "pretty" }}>
        {texto}
      </p>
      {children}
    </div>
  );
}
