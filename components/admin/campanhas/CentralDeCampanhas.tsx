"use client";

import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filaDoDia, pontuarLead, tetoDeHoje } from "@/lib/prospeccao";
import AbaFila from "./AbaFila";
import AbaLeads from "./AbaLeads";
import AbaResultados from "./AbaResultados";
import AbaCampanha from "./AbaCampanha";
import type { AbaDeCampanhas, ConfigDaCampanha, EmpresaAchada, LeadDaCampanha, NumeroDaProspeccao } from "./tipos";

// CAMPANHAS, a prospecção do dono do produto (docs/plano-campanhas.md). Hoje só
// o preview `/design/campanhas` monta esta tela, com dados de mentira e sem
// gravar nada: escolher, aprovar e salvar mudam só o estado da página.

export default function CentralDeCampanhas({
  abaInicial,
  agora,
  leadsIniciais,
  config: configInicial,
  numero,
  buscar,
}: {
  abaInicial: AbaDeCampanhas;
  agora: number;
  leadsIniciais: LeadDaCampanha[];
  config: ConfigDaCampanha;
  numero: NumeroDaProspeccao;
  /** A busca de empresas (no preview, um filtro em memória; de verdade, a rota do admin). */
  buscar: (segmento: string) => EmpresaAchada[];
}) {
  const [aba, setAba] = useState<AbaDeCampanhas>(abaInicial);
  const [leads, setLeads] = useState(leadsIniciais);
  const [config, setConfig] = useState(configInicial);

  const teto = tetoDeHoje(config.tetoDiario);
  const restamHoje = Math.max(0, teto - numero.enviadasHoje);
  const fila = useMemo(
    () =>
      filaDoDia(
        leads.map((l) => ({
          id: l.id,
          situacao: l.situacao,
          pontos: pontuarLead(l.sinais).pontos,
          impedimento: pontuarLead(l.sinais).impedimento,
          toque: l.toque,
          proximoToqueEm: l.proximoToqueEm,
        })),
        restamHoje,
        agora,
      ),
    [leads, restamHoje, agora],
  );

  const escolher = useCallback(
    (empresas: EmpresaAchada[]) =>
      setLeads((atual) => {
        const ja = new Set(atual.map((l) => l.fonteId));
        const novos = empresas
          .filter((e) => !ja.has(e.fonteId))
          .map<LeadDaCampanha>((e, i) => ({
            ...e,
            id: `novo-${atual.length + i + 1}`,
            situacao: "escolhido",
            toque: 0,
            abordadoEm: null,
            respondeuEm: null,
            proximoToqueEm: null,
            ultimaResposta: null,
          }));
        return [...novos, ...atual];
      }),
    [],
  );

  const descartar = useCallback(
    (id: string) => setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, situacao: "descartado" } : l))),
    [],
  );

  return (
    <Card asChild variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <section aria-label="Campanhas" data-slot="campanhas">
        <Tabs value={aba} onValueChange={(v) => setAba(v as AbaDeCampanhas)} className="min-h-0 flex-1">
          <div className="border-b border-line px-4 pb-0 pt-4 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-titulo">Campanhas</h1>
              <Badge variant={config.ativa ? "estado-bom" : "estado-neutro"} data-slot="campanhas-estado">
                {config.ativa ? "Ativa" : "Pausada"}
              </Badge>
              <span className="text-apoio text-ink-2">{config.nome}</span>
            </div>
            <p className="mt-1 text-legenda text-ink-3">
              Prospecção pelo número da OBS, no máximo 10 por dia. Só você vê esta tela; nada sai sem a sua aprovação.
            </p>
            <TabsList aria-label="Seções de Campanhas" className="mt-3">
              <TabsTrigger value="fila" data-slot="campanhas-aba-fila">
                {fila.length > 0 ? `Fila do dia (${fila.length})` : "Fila do dia"}
              </TabsTrigger>
              <TabsTrigger value="leads" data-slot="campanhas-aba-leads">
                Leads
              </TabsTrigger>
              <TabsTrigger value="resultados" data-slot="campanhas-aba-resultados">
                Resultados
              </TabsTrigger>
              <TabsTrigger value="campanha" data-slot="campanhas-aba-campanha">
                Campanha
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="fila" className="min-h-0 flex-1">
            <AbaFila
              fila={fila}
              leads={leads}
              config={config}
              numero={numero}
              teto={teto}
              agora={agora}
              irParaLeads={() => setAba("leads")}
            />
          </TabsContent>
          <TabsContent value="leads" className="min-h-0 flex-1">
            <AbaLeads leads={leads} buscar={buscar} aoEscolher={escolher} aoDescartar={descartar} />
          </TabsContent>
          <TabsContent value="resultados" className="min-h-0 flex-1">
            <AbaResultados leads={leads} numero={numero} teto={teto} config={config} />
          </TabsContent>
          <TabsContent value="campanha" className="min-h-0 flex-1">
            <AbaCampanha config={config} aoSalvar={setConfig} exemplo={leads[0] ?? null} />
          </TabsContent>
        </Tabs>
      </section>
    </Card>
  );
}
