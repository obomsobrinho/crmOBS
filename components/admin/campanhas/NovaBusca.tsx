"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { numeroBR } from "@/lib/format";
import { buscarCidades, carregarMunicipios, type MunicipiosPorUf } from "@/lib/municipios";
import {
  MINIMOS_DE_AVALIACOES,
  OPCOES_PADRAO,
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
  aberto,
  aoMudar,
  aoBuscar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoBuscar: (o: OpcoesDaBusca) => void;
}) {
  const [o, setO] = useState<OpcoesDaBusca>(OPCOES_PADRAO);
  const [termo, setTermo] = useState("");
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

  // A lista de cidades (um pedaço à parte, ~100 KB) só baixa quando o diálogo abre.
  const [municipios, setMunicipios] = useState<MunicipiosPorUf | null>(null);
  useEffect(() => {
    if (!aberto || municipios) return;
    let vivo = true;
    carregarMunicipios()
      .then((m) => {
        if (vivo) setMunicipios(m);
      })
      .catch((e) => console.error("nova busca, cidades:", e));
    return () => {
      vivo = false;
    };
  }, [aberto, municipios]);
  const cidadesDaUf = municipios?.[o.uf] ?? null;
  const buscarCidade = useCallback(
    (texto: string) => buscarCidades(cidadesDaUf ?? [], texto).map((c) => ({ valor: String(c.ibge), rotulo: c.nome })),
    [cidadesDaUf],
  );
  const maximo = maximoDaBusca(comDigitado);

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent
        tamanho="gestao"
        className="max-w-xl"
        data-slot="nova-busca"
        // O foco vai para o segmento, não para o "x" de fechar (o primeiro focável).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          campoDoTermo.current?.focus();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <DialogTitle>Nova busca</DialogTitle>
            <DialogDescription className="mt-1">Empresas do Google Maps. Roda em segundo plano, leva alguns minutos.</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-chrome" aria-label="Fechar">
              <X size={18} />
            </Button>
          </DialogClose>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (problemas.length > 0) return;
            aoBuscar({ ...comDigitado, cidade: comDigitado.cidade.trim() });
            setO(OPCOES_PADRAO);
            setTermo("");
          }}
        >
          <AreaRolavel className="min-h-0 flex-1">
            <div className="flex flex-col gap-6 px-6 py-5">
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
                  <Select value={o.uf} onValueChange={(uf) => mudar({ uf, cidade: "", cidadeIbge: null })}>
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
                      if (c) mudar({ cidade: c.nome, cidadeIbge: c.ibge });
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

          <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
            <p className="text-legenda tabular-nums text-ink-3" data-slot="nova-busca-custo">
              {maximo > 0
                ? `Até ${numeroBR(maximo)} empresas, a partir de ${usd(custoMinimoDaBuscaUsd(comDigitado))}${comDigitado.buscarContatos ? " mais os contatos" : ""}`
                : "Escolha o segmento"}
            </p>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={() => aoMudar(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={problemas.length > 0} title={problemas.join(". ") || undefined} data-slot="nova-busca-buscar">
                Buscar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
