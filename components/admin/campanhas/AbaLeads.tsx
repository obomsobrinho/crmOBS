"use client";

import { memo, useMemo, useState } from "react";
import { Search, SearchX, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CampoBusca } from "@/components/ui/campo-busca";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { normalizar } from "@/lib/clientes";
import { diaMesCurtoSP } from "@/lib/fuso";
import { numeroBR } from "@/lib/format";
import { useDebounce } from "@/lib/use-debounce";
import { usePaginada } from "@/lib/use-paginada";
import {
  ROTULO_DO_ANGULO,
  anguloDaAbordagem,
  pontuarLead,
  resumoDoSite,
  tipoDoTelefone,
  type Oferta,
} from "@/lib/prospeccao";
import FichaDoLead from "./FichaDoLead";
import { SeloDaPontuacao, SeloDaSituacao } from "./pecas";
import type { ConfigDaCampanha, EmpresaAchada, LeadDaCampanha } from "./tipos";

// LEADS: buscar empresas (segmento e cidade), ver a pontuação com os motivos e
// escolher as melhores; e a lista dos já escolhidos com a situação de cada um.
// Só o que o dono escolhe é gravado (minimização, plano seção 7).

type Modo = "buscar" | "escolhidos";

function textoDoAngulo(sinais: EmpresaAchada["sinais"], ofertas: Oferta[]): string {
  const a = anguloDaAbordagem(sinais, ofertas);
  return a.temGancho ? `Oferta: ${ROTULO_DO_ANGULO[a.angulo]}.` : "Sem gancho claro.";
}

/** Lista vazia estável: um `[]` novo a cada render recomeçaria a paginação. */
const NENHUMA: EmpresaAchada[] = [];

/**
 * Lista em memória com a MESMA paginação de 10 e rolagem infinita das listas de
 * verdade (`usePaginada`). Na tela real, `buscar` é a rota do admin.
 */
function usePaginaDeMemoria<T>(lista: T[], chave: (t: T) => string) {
  const inicial = useMemo(() => lista.slice(0, 10), [lista]);
  return usePaginada<T, T[]>({
    inicial,
    temMaisInicial: lista.length > 10,
    params: lista,
    chave,
    revalidarAoVoltar: false,
    buscar: async (todos, depois, n) => {
      const i = depois === null ? 0 : todos.findIndex((t) => chave(t) === chave(depois)) + 1;
      return todos.slice(i, i + n);
    },
  });
}

function AbaLeads({
  leads,
  ofertas,
  objecoes,
  buscar,
  aoEscolher,
  aoDescartar,
}: {
  leads: LeadDaCampanha[];
  ofertas: Oferta[];
  objecoes: ConfigDaCampanha["objecoes"];
  buscar: (segmento: string) => EmpresaAchada[];
  aoEscolher: (empresas: EmpresaAchada[]) => void;
  aoDescartar: (id: string) => void;
}) {
  const [modo, setModo] = useState<Modo>("buscar");
  const [ficha, setFicha] = useState<EmpresaAchada | null>(null);
  const escolhidos = leads.filter((l) => l.situacao !== "descartado");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-4 md:px-5">
        <Button
          variant="chip"
          size="chip"
          data-ativo={modo === "buscar" ? "sim" : undefined}
          aria-pressed={modo === "buscar"}
          onClick={() => setModo("buscar")}
        >
          Buscar empresas
        </Button>
        <Button
          variant="chip"
          size="chip"
          data-ativo={modo === "escolhidos" ? "sim" : undefined}
          aria-pressed={modo === "escolhidos"}
          onClick={() => setModo("escolhidos")}
        >
          Escolhidos
          <span className="font-bold tabular-nums opacity-75">{escolhidos.length}</span>
        </Button>
      </div>
      {modo === "buscar" ? (
        <Busca buscar={buscar} leads={leads} ofertas={ofertas} aoEscolher={aoEscolher} aoAbrir={setFicha} />
      ) : (
        <Escolhidos leads={escolhidos} aoDescartar={aoDescartar} aoAbrir={setFicha} />
      )}
      <FichaDoLead empresa={ficha} ofertas={ofertas} objecoes={objecoes} aoFechar={() => setFicha(null)} />
    </div>
  );
}

function Busca({
  buscar,
  leads,
  ofertas,
  aoEscolher,
  aoAbrir,
}: {
  buscar: (segmento: string) => EmpresaAchada[];
  leads: LeadDaCampanha[];
  ofertas: Oferta[];
  aoEscolher: (empresas: EmpresaAchada[]) => void;
  aoAbrir: (e: EmpresaAchada) => void;
}) {
  const [segmento, setSegmento] = useState("");
  const [cidade, setCidade] = useState("Cidade Exemplo");
  const [resultado, setResultado] = useState<EmpresaAchada[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  // As opções de cada busca, como no Deskcomm: auditar o site, buscar e-mails e redes, prévia com IA.
  const [auditar, setAuditar] = useState(true);
  const [contatos, setContatos] = useState(false);

  const jaNaCampanha = useMemo(() => new Set(leads.map((l) => l.fonteId)), [leads]);
  const ordenado = resultado ?? NENHUMA;
  const { itens, temMais, fimRef } = usePaginaDeMemoria(ordenado, (e) => e.fonteId);

  function alternar(id: string, marcado: boolean) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  function escolher() {
    aoEscolher(ordenado.filter((e) => marcados.has(e.fonteId)));
    setMarcados(new Set());
  }

  return (
    <>
      <form
        className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3 pt-3 md:px-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          // Os que dá para escolher primeiro e, entre eles, os melhores: a fonte devolve na
          // ordem dela. A ordem fica a da busca: escolher alguém não reordena a lista.
          const fora = (e: EmpresaAchada) => (jaNaCampanha.has(e.fonteId) || pontuarLead(e.sinais).impedimento ? 1 : 0);
          setResultado(
            [...buscar(segmento)].sort((a, b) => fora(a) - fora(b) || pontuarLead(b.sinais).pontos - pontuarLead(a.sinais).pontos),
          );
          setMarcados(new Set());
        }}
      >
        <Input
          className="min-w-0 flex-1 md:max-w-64"
          aria-label="Segmento"
          placeholder="Segmento, por exemplo barbearia"
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
        />
        <Input
          className="min-w-0 flex-1 md:max-w-48"
          aria-label="Cidade"
          placeholder="Cidade"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
        />
        <Button type="submit" variant="outline" size="control" data-slot="leads-buscar">
          <Search size={14} />
          Buscar
        </Button>
        {marcados.size > 0 && (
          <Button type="button" variant="brand" size="control" className="ml-auto" data-slot="leads-escolher" onClick={escolher}>
            Escolher {marcados.size} {marcados.size === 1 ? "empresa" : "empresas"}
          </Button>
        )}
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5" data-slot="leads-opcoes">
          <label className="flex cursor-pointer items-center gap-2 text-apoio text-ink">
            <Checkbox checked={auditar} onCheckedChange={(v) => setAuditar(v === true)} />
            Auditar o site
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-apoio text-ink">
            <Checkbox checked={contatos} onCheckedChange={(v) => setContatos(v === true)} />
            Buscar e-mails e redes
          </label>
          <label className="flex items-center gap-2 text-apoio text-ink-3">
            <Checkbox checked={false} disabled />
            Prévia da mensagem com IA (fase 2)
          </label>
        </div>
        <p className="w-full text-legenda text-ink-3">
          Prévia com empresas de mentira. A fonte de verdade (Google Places ou Apify) é decisão sua; nenhuma busca
          paga é feita aqui.
        </p>
      </form>

      <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
        {resultado === null ? (
          <EstadoVazio
            icone={Search}
            titulo="Busque por segmento e cidade"
            texto="Cada empresa vem com uma pontuação e os motivos. Telefone fixo, quem já é cliente e quem pediu para sair não entram na fila."
          />
        ) : ordenado.length === 0 ? (
          <EstadoVazio icone={SearchX} titulo={`Nada para “${segmento}”`} texto="Tente outro segmento." />
        ) : (
          <ul data-slot="leads-resultado">
            {itens.map((e) => {
              const p = pontuarLead(e.sinais);
              const naCampanha = jaNaCampanha.has(e.fonteId);
              const bloqueado = p.impedimento !== null || naCampanha;
              return (
                <li
                  key={e.fonteId}
                  className="flex items-start gap-2 border-b border-line-soft px-4 py-3 md:px-5"
                  data-slot="leads-empresa"
                >
                  <label className={bloqueado ? "flex min-w-0 flex-1 gap-3" : "flex min-w-0 flex-1 cursor-pointer gap-3"}>
                    <Checkbox
                      className="mt-1"
                      disabled={bloqueado}
                      checked={marcados.has(e.fonteId)}
                      onCheckedChange={(v) => alternar(e.fonteId, v === true)}
                      aria-label={`Escolher ${e.nome}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-corpo font-semibold text-ink">{e.nome}</span>
                        <SeloDaPontuacao sinais={e.sinais} />
                        {naCampanha && <span className="text-legenda text-ink-3">Já está na campanha</span>}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-apoio text-ink-2">
                        <span>
                          {e.segmento}, {e.bairro}
                        </span>
                        {e.nota !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Star size={12} className="text-ink-3" aria-hidden />
                            {numeroBR(e.nota)} ({numeroBR(e.avaliacoes ?? 0)})
                          </span>
                        )}
                        <span>{tipoDoTelefone(e.telefone) === "celular" ? "Celular" : "Fixo"}</span>
                      </span>
                      <span className="mt-0.5 block text-legenda text-ink-3">{e.horario}</span>
                      {auditar && (
                        <span className="mt-1 block text-apoio text-ink-2" data-slot="leads-raio-x">
                          <span className="font-semibold text-ink">{textoDoAngulo(e.sinais, ofertas)}</span>{" "}
                          {resumoDoSite(e.sinais.site)}.
                        </span>
                      )}
                    </span>
                  </label>
                  <Button variant="ghost" size="control" onClick={() => aoAbrir(e)}>
                    Detalhes
                  </Button>
                </li>
              );
            })}
            {temMais && (
              <li
                ref={(el) => {
                  fimRef.current = el;
                }}
                aria-hidden
                className="h-px"
              />
            )}
          </ul>
        )}
      </AreaRolavel>
    </>
  );
}

function Escolhidos({
  leads,
  aoDescartar,
  aoAbrir,
}: {
  leads: LeadDaCampanha[];
  aoDescartar: (id: string) => void;
  aoAbrir: (e: EmpresaAchada) => void;
}) {
  const [q, setQ] = useState("");
  const busca = useDebounce(q, 300);
  const filtrados = useMemo(() => {
    const t = normalizar(busca.trim());
    return t === "" ? leads : leads.filter((l) => normalizar(l.nome).includes(t));
  }, [leads, busca]);
  const { itens, temMais, fimRef } = usePaginaDeMemoria(filtrados, (l) => l.id);

  return (
    <>
      <div className="border-b border-line px-4 pb-3 pt-3 md:px-5">
        <CampoBusca
          className="md:max-w-[420px]"
          valor={q}
          aoMudar={setQ}
          placeholder="Buscar pelo nome da empresa"
          rotulo="Buscar leads escolhidos"
          aoLimpar={() => setQ("")}
          mostrarLimpar={q !== ""}
        />
      </div>
      <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
        {filtrados.length === 0 ? (
          <EstadoVazio
            icone={Users}
            titulo={busca ? `Nenhum lead para “${busca}”` : "Nenhum lead escolhido"}
            texto={busca ? "A busca olha o nome da empresa." : "Escolha empresas em Buscar empresas."}
          />
        ) : (
          <ul data-slot="leads-escolhidos">
            {itens.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3 md:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-corpo font-semibold text-ink">{l.nome}</span>
                    <SeloDaSituacao situacao={l.situacao} />
                    <SeloDaPontuacao sinais={l.sinais} />
                  </span>
                  <span className="mt-0.5 block text-apoio text-ink-2">
                    {l.segmento}, {l.bairro}, {resumoDoSite(l.sinais.site).toLowerCase()}
                    {l.abordadoEm !== null && ` · abordado em ${diaMesCurtoSP(new Date(l.abordadoEm).toISOString())}`}
                    {l.toque > 0 && `, ${l.toque} de 3 toques`}
                  </span>
                </span>
                <Button variant="ghost" size="control" onClick={() => aoAbrir(l)}>
                  Detalhes
                </Button>
                {l.situacao === "escolhido" && (
                  <Button variant="ghost" size="control" onClick={() => aoDescartar(l.id)}>
                    Descartar
                  </Button>
                )}
              </li>
            ))}
            {temMais && (
              <li
                ref={(el) => {
                  fimRef.current = el;
                }}
                aria-hidden
                className="h-px"
              />
            )}
          </ul>
        )}
      </AreaRolavel>
    </>
  );
}

export default memo(AbaLeads);
