"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Minus, Plus, X } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { numeroBR } from "@/lib/format";
import { buscarCidades, carregarMunicipios, cidadeDoCodigo, cidadeMaisProxima, type MunicipiosPorUf } from "@/lib/municipios";
import {
  MINIMOS_DE_AVALIACOES,
  OPCOES_PADRAO,
  RAIOS_KM,
  RAIO_PADRAO_KM,
  proximoRaio,
  QUANTIDADES_POR_TERMO,
  UFS,
  categoriasSugeridas,
  custoMinimoDaBuscaUsd,
  maximoDaBusca,
  problemasDaBusca,
  type FiltroDeSiteDaBusca,
  type NotaMinima,
  type OpcoesDaBusca,
} from "@/lib/prospeccao";

// NOVA BUSCA (dono, 29/10/2026: "essa criação da busca não está muito pobre?").
// O que buscar (um ou mais segmentos), onde (o estado primeiro e a cidade DA LISTA
// do IBGE, digitando, revisão de 30/10/2026: nunca um nome errado), quantas
// empresas por segmento (o teto de custo) e os filtros. Nota, site, categoria e
// mínimo de avaliações são aplicados do NOSSO lado (o dado já vem em todo item; o
// filtro da fonte custa por empresa); só "fechadas" e os contatos vão para a fonte.
// O rodapé mostra o máximo de empresas e o custo mínimo pelo preço de tabela.
//
// É uma PÁGINA (revisão de 30/10/2026, segunda rodada; antes era um modal pequeno
// para o mapa): o mapa grande é a peça principal e os campos ficam numa coluna ao
// lado (no celular, o mapa em cima). O rodapé com "Buscar" fica sempre à vista.
// Mapa e campos são uma coisa só: escolher UF e cidade move o mapa; mover o centro
// (arrastar o pino ou clicar) para dentro de outra cidade troca UF e cidade nos
// campos, pela sede mais próxima. O mapa abre na cidade da última busca, ou em
// Mutum (MG), a cidade da OBS, quando ainda não houve busca.

const NOTAS: { valor: NotaMinima; rotulo: string }[] = [
  { valor: null, rotulo: "Qualquer" },
  { valor: 3.5, rotulo: "3,5 ou mais" },
  { valor: 4, rotulo: "4 ou mais" },
  { valor: 4.5, rotulo: "4,5 ou mais" },
];

const SITES: { valor: FiltroDeSiteDaBusca; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todas" },
  { valor: "sem_site", rotulo: "Só sem site" },
  { valor: "com_site", rotulo: "Só com site" },
];

/** Onde o mapa abre sem busca anterior: Mutum (MG), a cidade da OBS (código IBGE). */
const CIDADE_DA_OBS = { uf: "MG", ibge: 3144003 };

// O mapa (Leaflet) só carrega no navegador.
const Mapa = dynamic(() => import("./Mapa"), { ssr: false });

const MINIMOS: { valor: (typeof MINIMOS_DE_AVALIACOES)[number]; rotulo: string }[] = MINIMOS_DE_AVALIACOES.map((m) => ({
  valor: m,
  rotulo: m === null ? "Qualquer" : `${m} ou mais`,
}));

const usd = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-apoio font-semibold text-ink">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export default function NovaBusca({
  voltar,
  aoBuscar,
  localInicial,
}: {
  voltar: () => void;
  /** Começa a busca; devolve a recusa em uma frase (a página fica aberta para corrigir). */
  aoBuscar: (o: OpcoesDaBusca) => Promise<{ ok: true } | { ok: false; erro: string }>;
  /** A cidade da última busca (UF e código IBGE); null = Mutum, a cidade da OBS. */
  localInicial: { uf: string; ibge: number } | null;
}) {
  const [o, setO] = useState<OpcoesDaBusca>(OPCOES_PADRAO);
  const [termo, setTermo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const campoDoTermo = useRef<HTMLInputElement>(null);
  const mudar = (patch: Partial<OpcoesDaBusca>) => setO((atual) => ({ ...atual, ...patch }));
  const adicionar = () => {
    const t = termo.trim().replace(/,$/, "").trim();
    if (t.length >= 3 && !o.termos.includes(t)) mudar({ termos: [...o.termos, t] });
    setTermo("");
  };
  // O que está digitado e ainda não virou pílula também conta.
  const comDigitado: OpcoesDaBusca = termo.trim().length >= 3 ? { ...o, termos: [...o.termos, termo.trim()] } : o;
  const problemas = problemasDaBusca(comDigitado);
  const sugestoes = categoriasSugeridas(comDigitado.termos);

  // A lista de cidades (um pedaço à parte, ~100 KB) baixa quando a página abre; com ela,
  // os campos já nascem na cidade da última busca (ou em Mutum) e o mapa vai até lá.
  const [municipios, setMunicipios] = useState<MunicipiosPorUf | null>(null);
  useEffect(() => {
    let vivo = true;
    carregarMunicipios()
      .then((m) => {
        if (!vivo) return;
        setMunicipios(m);
        const inicio = (localInicial && cidadeDoCodigo(m, localInicial.uf, localInicial.ibge)) || cidadeDoCodigo(m, CIDADE_DA_OBS.uf, CIDADE_DA_OBS.ibge);
        if (inicio) setO((atual) => (atual.cidadeIbge === null ? { ...atual, uf: inicio.uf, cidade: inicio.nome, cidadeIbge: inicio.ibge } : atual));
      })
      .catch((e) => console.error("nova busca, cidades:", e));
    return () => {
      vivo = false;
    };
  }, [localInicial]);
  useEffect(() => campoDoTermo.current?.focus(), []);
  const cidadesDaUf = municipios?.[o.uf] ?? null;
  const cidadeEscolhida = cidadesDaUf?.find((c) => c.ibge === o.cidadeIbge) ?? null;
  const vista = useMemo(
    () => (cidadeEscolhida?.lat != null && cidadeEscolhida.lng != null ? { lat: cidadeEscolhida.lat, lng: cidadeEscolhida.lng, zoom: 12 } : null),
    [cidadeEscolhida],
  );
  // O pino do mapa: o centro ajustado, ou a sede da cidade escolhida (sem raio).
  const centro = useMemo(() => (o.area ? o.area : vista ? { lat: vista.lat, lng: vista.lng, raioKm: null } : null), [o.area, vista]);
  // Mover o centro: a área nasce (com o raio padrão) e, se o ponto caiu noutra cidade,
  // UF e cidade dos campos vão para ela (a sede mais próxima da lista).
  const moverCentro = useCallback(
    (lat: number, lng: number) =>
      setO((atual) => {
        const ponto = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
        const area = { ...ponto, raioKm: atual.area?.raioKm ?? RAIO_PADRAO_KM };
        const perto = municipios ? cidadeMaisProxima(municipios, ponto) : null;
        return perto && perto.ibge !== atual.cidadeIbge
          ? { ...atual, area, uf: perto.uf, cidade: perto.nome, cidadeIbge: perto.ibge }
          : { ...atual, area };
      }),
    [municipios],
  );
  const mudarRaio = (passo: 1 | -1) => {
    if (!o.area) {
      if (vista) mudar({ area: { lat: vista.lat, lng: vista.lng, raioKm: RAIO_PADRAO_KM } });
      return;
    }
    mudar({ area: { ...o.area, raioKm: proximoRaio(o.area.raioKm, passo) } });
  };
  const buscarCidade = useCallback(
    (texto: string) => buscarCidades(cidadesDaUf ?? [], texto).map((c) => ({ valor: String(c.ibge), rotulo: c.nome })),
    [cidadesDaUf],
  );
  const maximo = maximoDaBusca(comDigitado);

  const enviar = async () => {
    if (problemas.length > 0) return;
    setEnviando(true);
    setFalha(null);
    try {
      const r = await aoBuscar({ ...comDigitado, cidade: comDigitado.cidade.trim() });
      if (!r.ok) setFalha(r.erro);
    } catch (e) {
      console.error("nova busca:", e);
      setFalha("Não deu para começar a busca agora. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      aria-label="Nova busca"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-raised md:rounded-xl md:border md:border-line"
      data-slot="nova-busca"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-5">
        <Button type="button" variant="ghost" size="icon-chrome" aria-label="Voltar para Leads" onClick={voltar} data-slot="nova-busca-voltar">
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0">
          <h2 className="text-titulo text-ink">Nova busca</h2>
          <p className="truncate text-legenda text-ink-3">Empresas do Google Maps. Roda em segundo plano, leva alguns minutos.</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* O mapa: a peça principal (no celular, em cima). */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3 lg:order-last lg:min-h-0 lg:flex-1 lg:border-b-0 lg:p-4" data-bloco="nova-busca-area">
          <Mapa
            vista={vista}
            area={centro}
            aoMoverCentro={moverCentro}
            rotulo={o.cidade ? `Mapa de ${o.cidade}: arraste o centro ou clique para mover` : "Mapa da busca"}
            className="h-64 lg:h-auto lg:min-h-0 lg:flex-1"
            data-slot="nova-busca-mapa"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-chrome"
              aria-label="Diminuir o raio"
              disabled={!o.area || o.area.raioKm <= RAIOS_KM[0]}
              onClick={() => mudarRaio(-1)}
            >
              <Minus aria-hidden />
            </Button>
            <span className="min-w-36 text-center text-apoio tabular-nums text-ink" aria-live="polite" data-slot="nova-busca-raio">
              {o.area ? `Raio: ${o.area.raioKm} km` : "Raio: a cidade inteira"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-chrome"
              aria-label="Aumentar o raio"
              disabled={!vista || (o.area !== null && o.area.raioKm >= RAIOS_KM[RAIOS_KM.length - 1])}
              onClick={() => mudarRaio(1)}
            >
              <Plus aria-hidden />
            </Button>
            {o.area && (
              <Button type="button" variant="link" size="link" className="ml-auto" onClick={() => mudar({ area: null })} data-slot="nova-busca-cidade-inteira">
                Usar a cidade inteira
              </Button>
            )}
          </div>
        </div>

        {/* Os campos: uma coluna que rola por dentro, com o rodapé de "Buscar" sempre à vista. */}
        <div className="flex min-h-0 flex-1 flex-col lg:w-[440px] lg:flex-none lg:border-r lg:border-line">
          <AreaRolavel className="min-h-0 flex-1">
            <div className="flex flex-col gap-6 px-5 py-5">
              <Campo titulo="O que buscar">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-[var(--input-bg)] p-1.5 focus-within:border-brand-line">
                  {o.termos.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-md bg-bloco py-1 pl-2.5 pr-1 text-apoio text-ink" data-slot="nova-busca-termo">
                      {t}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-chrome"
                        className="size-5"
                        aria-label={`Tirar ${t}`}
                        onClick={() => mudar({ termos: o.termos.filter((x) => x !== t) })}
                      >
                        <X size={12} />
                      </Button>
                    </span>
                  ))}
                  <Input
                    variant="limpo"
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && termo.trim()) {
                        e.preventDefault();
                        adicionar();
                      } else if (e.key === "Backspace" && !termo && o.termos.length > 0) {
                        mudar({ termos: o.termos.slice(0, -1) });
                      }
                    }}
                    placeholder={o.termos.length === 0 ? "clínica de estética" : "Outro segmento"}
                    aria-label="Segmento"
                    className="min-w-40 flex-1 px-1.5 text-apoio"
                    ref={campoDoTermo}
                  />
                </div>
                <p className="text-legenda text-ink-3">Enter para juntar mais de um segmento na mesma busca.</p>
              </Campo>

              <Campo titulo="Onde">
                <div className="flex gap-2">
                  <Select value={o.uf} onValueChange={(uf) => mudar({ uf, cidade: "", cidadeIbge: null, area: null })}>
                    <SelectTrigger size="field" className="w-24" aria-label="Estado" data-slot="nova-busca-uf">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {UFS.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Combobox
                    className="min-w-0 flex-1"
                    rotulo="Cidade"
                    placeholder={!o.uf ? "Escolha o estado primeiro" : cidadesDaUf ? "Escolha a cidade" : "Carregando as cidades…"}
                    placeholderDaBusca="Digite o nome da cidade"
                    vazio="Nenhuma cidade com esse nome neste estado"
                    disabled={!o.uf || !cidadesDaUf}
                    valor={o.cidadeIbge === null ? null : String(o.cidadeIbge)}
                    rotuloDoValor={o.cidadeIbge === null ? null : o.cidade}
                    buscar={buscarCidade}
                    aoEscolher={(v) => {
                      const c = cidadesDaUf?.find((x) => String(x.ibge) === v);
                      if (c) mudar({ cidade: c.nome, cidadeIbge: c.ibge, area: null });
                    }}
                    data-campo="nova-busca-cidade"
                  />
                </div>
              </Campo>

              <Campo titulo="Quantas empresas por segmento">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Quantas empresas por segmento">
                  {QUANTIDADES_POR_TERMO.map((n) => (
                    <Button key={n} type="button" variant="alternavel" size="control" aria-pressed={o.porTermo === n} onClick={() => mudar({ porTermo: n })}>
                      Até {n}
                    </Button>
                  ))}
                </div>
              </Campo>

              <Campo titulo="Nota mínima no Google">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Nota mínima no Google">
                  {NOTAS.map((n) => (
                    <Button
                      key={n.rotulo}
                      type="button"
                      variant="alternavel"
                      size="control"
                      aria-pressed={o.notaMinima === n.valor}
                      onClick={() => mudar({ notaMinima: n.valor })}
                    >
                      {n.rotulo}
                    </Button>
                  ))}
                </div>
              </Campo>

              <Campo titulo="Mínimo de avaliações no Google">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Mínimo de avaliações no Google">
                  {MINIMOS.map((m) => (
                    <Button
                      key={m.rotulo}
                      type="button"
                      variant="alternavel"
                      size="control"
                      aria-pressed={o.minAvaliacoes === m.valor}
                      onClick={() => mudar({ minAvaliacoes: m.valor })}
                    >
                      {m.rotulo}
                    </Button>
                  ))}
                </div>
              </Campo>

              {sugestoes.length > 0 && (
                <Campo titulo="Só desta categoria">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Só desta categoria" data-grupo="nova-busca-categorias">
                    {sugestoes.map((c) => {
                      const marcada = o.categorias.includes(c);
                      return (
                        <Button
                          key={c}
                          type="button"
                          variant="alternavel"
                          size="control"
                          aria-pressed={marcada}
                          onClick={() => mudar({ categorias: marcada ? o.categorias.filter((x) => x !== c) : [...o.categorias, c] })}
                        >
                          {c}
                        </Button>
                      );
                    })}
                  </div>
                </Campo>
              )}

              <Campo titulo="Site">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Site">
                  {SITES.map((s) => (
                    <Button key={s.valor} type="button" variant="alternavel" size="control" aria-pressed={o.site === s.valor} onClick={() => mudar({ site: s.valor })}>
                      {s.rotulo}
                    </Button>
                  ))}
                </div>
              </Campo>

              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2.5 text-apoio text-ink">
                  <Checkbox checked={o.ignorarFechados} onCheckedChange={(v) => mudar({ ignorarFechados: v === true })} />
                  Deixar de fora empresas fechadas
                </label>
                <label className="flex items-start gap-2.5 text-apoio text-ink">
                  <Checkbox className="mt-0.5" checked={o.buscarContatos} onCheckedChange={(v) => mudar({ buscarContatos: v === true })} />
                  <span>
                    Buscar e-mail e redes sociais no site da empresa
                    <span className="block text-legenda text-ink-3">Custa a mais por empresa na fonte.</span>
                  </span>
                </label>
              </div>
            </div>
          </AreaRolavel>

          <div className="flex flex-col gap-2 border-t border-line px-5 py-3" data-slot="nova-busca-rodape">
            {falha && (
              <Aviso tom="danger" data-bloco="nova-busca-falha">
                {falha}
              </Aviso>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-legenda tabular-nums text-ink-3" data-slot="nova-busca-custo">
                {maximo > 0
                  ? `Até ${numeroBR(maximo)} empresas, a partir de ${usd(custoMinimoDaBuscaUsd(comDigitado))}${comDigitado.buscarContatos ? " mais os contatos" : ""}`
                  : "Escolha o segmento"}
              </p>
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="ghost" onClick={voltar}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={problemas.length > 0}
                  carregando={enviando}
                  title={problemas.join(". ") || undefined}
                  data-slot="nova-busca-buscar"
                >
                  Buscar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
