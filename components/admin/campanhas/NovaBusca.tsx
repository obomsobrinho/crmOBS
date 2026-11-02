"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Minus, Plus } from "lucide-react";
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
  OPCOES_PADRAO,
  RAIOS_KM,
  RAIO_PADRAO_KM,
  proximoRaio,
  QUANTIDADES_POR_TERMO,
  UFS,
  custoMinimoDaBuscaUsd,
  maximoDaBusca,
  nomeDaBusca,
  problemasDaBusca,
  type OpcoesDaBusca,
} from "@/lib/prospeccao";
import type { AreaAnterior, LocalInicial } from "./tipos";

// NOVA BUSCA (dono, 29/10/2026: "essa criação da busca não está muito pobre?"; refeita
// em 02/11/2026). A busca traz TODAS as empresas da área, sem termo nem categoria: em
// cidade pequena muita empresa está mal classificada no Google, e o dono escolhe pelo
// nome depois. Nota, site, avaliações e categoria são filtros da tabela de leads (de
// graça); na fonte vai só "pular fechadas" (o filtro pago que o dono quis) e, se
// marcado, o e-mail e as redes. Os campos: um nome livre, onde (o estado e a cidade DA
// LISTA do IBGE), o raio (o mesmo valor do controle do mapa) e o teto de empresas. O
// rodapé mostra o teto e o custo máximo pelo preço de tabela do plano grátis.
//
// É uma PÁGINA (revisão de 30/10/2026, segunda rodada; antes era um modal pequeno
// para o mapa): o mapa grande é a peça principal e os campos ficam numa coluna ao
// lado (no celular, o mapa em cima). O rodapé com "Buscar" fica sempre à vista.
// Mapa e campos são uma coisa só: escolher UF e cidade move o mapa; mover o centro
// (arrastar o pino ou clicar) para dentro de outra cidade troca UF e cidade nos
// campos, pela sede mais próxima. O mapa abre na cidade da última busca, ou em
// Mutum (MG), a cidade da OBS, quando ainda não houve busca. Os círculos das buscas
// já feitas aparecem tracejados, para a nova ficar fora deles (não pagar de novo).

/** O valor do campo de raio sem área (a cidade inteira). */
const CIDADE_INTEIRA = "cidade";

/** Onde o mapa abre sem busca anterior: Mutum (MG), a cidade da OBS (código IBGE). */
const CIDADE_DA_OBS = { uf: "MG", ibge: 3144003 };

// O mapa (Leaflet) só carrega no navegador.
const Mapa = dynamic(() => import("./Mapa"), { ssr: false });

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
  areasAnteriores,
}: {
  voltar: () => void;
  /** Começa a busca; devolve a recusa em uma frase (a página fica aberta para corrigir). */
  aoBuscar: (o: OpcoesDaBusca) => Promise<{ ok: true } | { ok: false; erro: string }>;
  /** A cidade da última busca (UF e código IBGE); null = Mutum, a cidade da OBS. */
  localInicial: LocalInicial | null;
  /** Os círculos das buscas já feitas (tracejados no mapa). */
  areasAnteriores?: AreaAnterior[];
}) {
  const [o, setO] = useState<OpcoesDaBusca>(OPCOES_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const campoDoNome = useRef<HTMLInputElement>(null);
  const mudar = (patch: Partial<OpcoesDaBusca>) => setO((atual) => ({ ...atual, ...patch }));
  const problemas = problemasDaBusca(o);

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
  useEffect(() => campoDoNome.current?.focus(), []);
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
  // O raio escolhido no campo: o MESMO da área do mapa (sem área, o círculo nasce na sede da cidade).
  const escolherRaio = (v: string) => {
    if (v === CIDADE_INTEIRA) return mudar({ area: null });
    const raioKm = Number(v);
    if (o.area) mudar({ area: { ...o.area, raioKm } });
    else if (vista) mudar({ area: { lat: vista.lat, lng: vista.lng, raioKm } });
  };
  const buscarCidade = useCallback(
    (texto: string) => buscarCidades(cidadesDaUf ?? [], texto).map((c) => ({ valor: String(c.ibge), rotulo: c.nome })),
    [cidadesDaUf],
  );
  const maximo = maximoDaBusca(o);
  const nomeVazio = `"${nomeDaBusca({ ...o, nome: "" })}"`;

  const enviar = async () => {
    if (problemas.length > 0) return;
    setEnviando(true);
    setFalha(null);
    try {
      const r = await aoBuscar({ ...o, nome: o.nome.trim(), cidade: o.cidade.trim() });
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
            areasAnteriores={areasAnteriores}
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
              <Campo titulo="Nome da busca">
                <Input
                  value={o.nome}
                  onChange={(e) => mudar({ nome: e.target.value.slice(0, 80) })}
                  placeholder="clínicas e supermercados de dezembro"
                  aria-label="Nome da busca"
                  data-slot="nova-busca-nome"
                  ref={campoDoNome}
                />
                <p className="text-legenda text-ink-3">Só para você achar a busca depois. Vazio, ela vira {nomeVazio}.</p>
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

              <Campo titulo="Raio">
                <Select value={o.area ? String(o.area.raioKm) : CIDADE_INTEIRA} onValueChange={escolherRaio} disabled={!vista && !o.area}>
                  <SelectTrigger size="field" aria-label="Raio da busca" data-slot="nova-busca-raio-campo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CIDADE_INTEIRA}>A cidade inteira</SelectItem>
                    {RAIOS_KM.map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r} km em volta do centro
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-legenda text-ink-3">O centro é o pino do mapa: arraste ou clique no mapa para mudar.</p>
              </Campo>

              <Campo titulo="Quantas empresas no máximo">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Quantas empresas no máximo">
                  {QUANTIDADES_POR_TERMO.map((n) => (
                    <Button key={n} type="button" variant="alternavel" size="control" aria-pressed={o.porTermo === n} onClick={() => mudar({ porTermo: n })}>
                      Até {n}
                    </Button>
                  ))}
                </div>
                <p className="text-legenda text-ink-3">
                  Vêm todas as empresas da área, de qualquer segmento, e as fechadas ficam de fora. Nota, site, avaliações e categoria você filtra
                  depois, na lista de leads.
                </p>
              </Campo>

              <label className="flex items-start gap-2.5 text-apoio text-ink">
                <Checkbox className="mt-0.5" checked={o.buscarContatos} onCheckedChange={(v) => mudar({ buscarContatos: v === true })} />
                <span>
                  Buscar e-mail e redes sociais no site da empresa
                  <span className="block text-legenda text-ink-3">Custa a mais por empresa na fonte.</span>
                </span>
              </label>
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
                {`Até ${numeroBR(maximo)} empresas, no máximo ${usd(custoMinimoDaBuscaUsd(o))}${o.buscarContatos ? " mais os contatos" : ""}`}
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
