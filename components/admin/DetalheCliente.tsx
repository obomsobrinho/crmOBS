"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EstadoDoWhatsApp } from "@/lib/admin-alertas";
import { ehAbaDoCliente, type AbaDoCliente, type DetalheDoCliente } from "@/lib/admin-cliente";
import {
  fonteDoClienteDaApi,
  fonteDoClienteDaMemoria,
  type FonteDoCliente,
  type PreviewDoCliente,
} from "@/lib/admin-cliente-fonte";
import { alertasDaEmpresa, comLimite } from "@/lib/admin-empresas";
import AbaVisaoGeral from "@/components/admin/AbaVisaoGeral";
import { AvatarCliente, ChipAlerta, SeloSituacao, linhaDoPlano } from "@/components/admin/pecas";

// O diálogo do limite só pesa quando o dono clica em editar (chunk à parte). As abas de gráfico
// (Recharts) só entram no pacote quando a aba abre: a Visão geral não paga por elas.
const EditarLimiteDialog = dynamic(() => import("@/components/admin/EditarLimiteDialog"));
const AbaUsoDeIa = dynamic(() => import("@/components/admin/AbaUsoDeIa"));
const AbaAtendimento = dynamic(() => import("@/components/admin/AbaAtendimento"));

// DETALHE DE UM CLIENTE DA CENTRAL DO DONO (docs/plano-central-clientes.md,
// entrega 1). Cabeçalho com o nome, a situação e o alerta principal; três abas.
// A "Visão geral" já vem do servidor; "Uso de IA" e "Atendimento" só buscam na
// primeira vez que a aba abre (rotas do admin) e ficam montadas depois. O estado
// do WhatsApp é consultado ao vivo, UMA vez, pelo navegador, e entra nos alertas
// quando chega.
export default function DetalheCliente({
  detalhe,
  abaInicial = "visao",
  preview,
  hrefLista = "/clientes",
}: {
  detalhe: DetalheDoCliente;
  abaInicial?: AbaDoCliente;
  /** Preview `/design/clientes/detalhe`: tudo roda sobre a memória e editar não grava. */
  preview?: PreviewDoCliente;
  hrefLista?: string;
}) {
  const simular = !!preview;
  const [empresa, setEmpresa] = useState(detalhe.empresa);
  const [aba, setAba] = useState<AbaDoCliente>(abaInicial);
  const [visitadas, setVisitadas] = useState<Set<AbaDoCliente>>(() => new Set([abaInicial]));
  const [editando, setEditando] = useState(false);
  const [whatsapp, setWhatsapp] = useState<EstadoDoWhatsApp | null>(null);

  const fonte = useMemo<FonteDoCliente>(
    () => (preview ? fonteDoClienteDaMemoria(preview) : fonteDoClienteDaApi(detalhe.empresa.id)),
    [preview, detalhe.empresa.id],
  );

  const consultarWhatsapp = useCallback(() => {
    // A fonte nunca rejeita (falha vira `desconhecido` lá, uma vez só).
    void fonte.whatsapp().then(setWhatsapp);
  }, [fonte]);

  // Uma consulta ao abrir (`null` já quer dizer "checando"). Só quem tem
  // instância tem o que consultar; os outros mostram "Sem WhatsApp".
  const temInstancia = detalhe.empresa.temInstancia;
  useEffect(() => {
    if (temInstancia) consultarWhatsapp();
  }, [temInstancia, consultarWhatsapp]);

  function checarDeNovo() {
    setWhatsapp(null);
    consultarWhatsapp();
  }

  const alertas = useMemo(
    () => alertasDaEmpresa(empresa, detalhe.agora, whatsapp ?? undefined),
    [empresa, detalhe.agora, whatsapp],
  );
  const principal = alertas[0];

  function mudarAba(v: string) {
    if (!ehAbaDoCliente(v)) return;
    setAba(v);
    setVisitadas((cur) => (cur.has(v) ? cur : new Set(cur).add(v)));
  }

  return (
    <Card asChild variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <section aria-label={`Cliente ${empresa.nome}`} data-slot="central-detalhe">
        <Tabs value={aba} onValueChange={mudarAba} className="min-h-0 flex-1">
          <div className="border-b border-line px-4 pb-0 pt-3 md:px-5">
            <Button asChild variant="ghost" size="control" className="-ml-2">
              <Link href={hrefLista}>
                <ArrowLeft size={14} />
                Clientes
              </Link>
            </Button>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <AvatarCliente e={empresa} size="lg" />
              <h1 data-slot="central-detalhe-nome" className="min-w-0 truncate text-titulo">
                {empresa.nome}
              </h1>
              <SeloSituacao situacao={empresa.situacao} />
              {principal && <ChipAlerta alerta={principal} />}
            </div>
            <p className="mt-1.5 text-legenda text-ink-3">
              {linhaDoPlano(empresa)}
              {empresa.situacao.detalhe ? `, ${empresa.situacao.detalhe}` : ""}
            </p>

            <TabsList aria-label="Seções do cliente" className="mt-3">
              <TabsTrigger value="visao" data-slot="central-aba-visao-gatilho">
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="uso" data-slot="central-aba-uso-gatilho">
                Uso de IA
              </TabsTrigger>
              <TabsTrigger value="atendimento" data-slot="central-aba-atendimento-gatilho">
                Atendimento
              </TabsTrigger>
            </TabsList>
          </div>

          <AreaRolavel className="min-h-0 flex-1">
            <div className="px-4 py-4 md:px-5">
              <TabsContent value="visao" forceMount>
                <AbaVisaoGeral
                  detalhe={{ ...detalhe, empresa }}
                  alertas={alertas}
                  whatsapp={whatsapp}
                  onChecarWhatsapp={checarDeNovo}
                />
              </TabsContent>
              <TabsContent value="uso" forceMount>
                {visitadas.has("uso") && (
                  <AbaUsoDeIa
                    fonte={fonte}
                    empresa={empresa}
                    agora={detalhe.agora}
                    onEditarLimite={() => setEditando(true)}
                  />
                )}
              </TabsContent>
              <TabsContent value="atendimento" forceMount>
                {visitadas.has("atendimento") && <AbaAtendimento fonte={fonte} />}
              </TabsContent>
            </div>
          </AreaRolavel>
        </Tabs>

        {editando && (
          <EditarLimiteDialog
            key={empresa.id}
            empresa={empresa}
            simular={simular}
            onFechar={() => setEditando(false)}
            onSalvo={(id, limite) =>
              setEmpresa((cur) => (cur.id === id ? comLimite(cur, limite, detalhe.agora) : cur))
            }
          />
        )}
      </section>
    </Card>
  );
}
