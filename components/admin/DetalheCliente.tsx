"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
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
  type RespostaDoApagar,
} from "@/lib/admin-cliente-fonte";
import type { PedidoDeAcao } from "@/lib/admin-conta";
import { alertasDaEmpresa, comLimite } from "@/lib/admin-empresas";
import { custoEstimadoUsd } from "@/lib/custo-ia";
import { useCambio, type CambioDaTela } from "@/lib/use-cambio";
import AbaVisaoGeral from "@/components/admin/AbaVisaoGeral";
import AbaFinanceiro from "@/components/admin/AbaFinanceiro";
import AbaAcoes from "@/components/admin/AbaAcoes";
import { AvatarCliente, ChipAlerta, SeloSituacao } from "@/components/admin/pecas";

// O diálogo do limite só pesa quando o dono clica em editar (chunk à parte). As abas de gráfico
// (Recharts) só entram no pacote quando a aba abre: a Visão geral não paga por elas. Os três chunks
// são pedidos em segundo plano logo depois que o detalhe abre (`aquecer`), então a primeira troca de
// aba não espera o download. Os DADOS das abas, ao contrário, só são lidos quando o dono mostra que vai
// abrir uma (passar o mouse, focar ou apertar o gatilho: `lerDaAba`), e não a cada cliente aberto.
const carregarEditarLimite = () => import("@/components/admin/EditarLimiteDialog");
const carregarAbaUsoDeIa = () => import("@/components/admin/AbaUsoDeIa");
const carregarAbaAtendimento = () => import("@/components/admin/AbaAtendimento");
const EditarLimiteDialog = dynamic(carregarEditarLimite);
const AbaUsoDeIa = dynamic(carregarAbaUsoDeIa);
const AbaAtendimento = dynamic(carregarAbaAtendimento);

// DETALHE DE UM CLIENTE DA CENTRAL DO DONO (docs/plano-central-clientes.md,
// entrega 1). Cabeçalho com o nome, a situação e o alerta
// principal; cinco abas. A "Visão geral" já vem do servidor; "Uso de IA" e
// "Atendimento" só montam na primeira vez que a aba abre e ficam montadas depois
// (a troca de aba é só estado do navegador: nenhuma rota, nenhuma leitura nova, e
// as abas são `memo`, então trocar de aba não redesenha as outras). O que elas
// leem (os dois agregados) é adiantado em segundo plano quando a tela fica
// ociosa. O estado do WhatsApp é consultado ao vivo, UMA vez, pelo navegador, e
// entra nos alertas quando chega.
export default function DetalheCliente({
  detalhe,
  cambio: cambioDaTela,
  abaInicial = "visao",
  preview,
  hrefLista = "/clientes",
}: {
  detalhe: DetalheDoCliente;
  /**
   * A cotação PTAX do dólar: pronta (preview), `null` (indisponível) ou a PROMESSA de uma que ainda está sendo
   * buscada (a página não espera por ela: abre em US$ e troca para reais quando chega, `useCambio`).
   */
  cambio: CambioDaTela;
  abaInicial?: AbaDoCliente;
  /** Preview `/design/clientes/detalhe`: tudo roda sobre a memória e editar não grava. */
  preview?: PreviewDoCliente;
  hrefLista?: string;
}) {
  const { cambio, buscando: cambioBuscando } = useCambio(cambioDaTela);
  const [empresaDaRota, setEmpresa] = useState(detalhe.empresa);
  const [aba, setAba] = useState<AbaDoCliente>(abaInicial);
  const [visitadas, setVisitadas] = useState<Set<AbaDoCliente>>(() => new Set([abaInicial]));
  /** A caixa do limite de IA: aberta (com o valor já preenchido, ou `null` em branco) ou fechada (`false`). */
  const [editando, setEditando] = useState<{ sugestao: number | null } | false>(false);
  const [whatsapp, setWhatsapp] = useState<EstadoDoWhatsApp | null>(null);
  const [financeiro, setFinanceiro] = useState(detalhe.financeiro);
  /** Aviso no topo quando a ação não deixa a tela se explicar sozinha (preview, ou gravou e a releitura falhou). */
  const [recado, setRecado] = useState<string | null>(null);
  const [apagado, setApagado] = useState<Extract<RespostaDoApagar, { ok: true }> | null>(null);

  // O custo estimado sempre sai do preço do modelo DO CLIENTE (o do último turno): a linha que a rota de uma
  // ação devolve vem com o modelo do sistema, e a tela refaz a conta no mesmo lugar para nunca divergir.
  const empresa = useMemo(
    () => ({ ...empresaDaRota, custoUsd: custoEstimadoUsd(empresaDaRota.tokens, detalhe.modelo.nome) }),
    [empresaDaRota, detalhe.modelo.nome],
  );

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

  // Adianta os pedaços de CÓDIGO das abas pesadas quando o navegador está ocioso. Os DADOS (os dois agregados)
  // não: ler os dois a cada cliente aberto custava dois agregados no banco mesmo quando o dono só olhava a
  // Visão geral. Eles saem quando ele mostra a intenção (`lerDaAba`: mouse sobre o gatilho, foco ou aperto),
  // dezenas de milissegundos antes da aba abrir; a fonte lembra a resposta, e a aba a usa na hora.
  useEffect(() => {
    const aquecer = () => {
      void carregarAbaUsoDeIa();
      void carregarAbaAtendimento();
      void carregarEditarLimite();
    };
    // Safari não tem `requestIdleCallback`: o tipo do DOM diz que sempre existe, então o
    // alargamos para checar.
    const ocioso = window.requestIdleCallback as typeof window.requestIdleCallback | undefined;
    if (ocioso) {
      const id = ocioso.call(window, aquecer, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(aquecer, 400);
    return () => window.clearTimeout(id);
  }, []);

  // A leitura dos dados de uma aba, no instante em que o dono mostra que vai abri-la. Falha aqui é silenciosa: a
  // aba lê de novo quando abrir e mostra o "tentar de novo" se ainda falhar.
  const lerDaAba = useCallback(
    (aba: AbaDoCliente) => {
      if (aba === "uso") fonte.uso().catch(() => {});
      if (aba === "atendimento") fonte.atendimento().catch(() => {});
    },
    [fonte],
  );

  const checarDeNovo = useCallback(() => {
    setWhatsapp(null);
    consultarWhatsapp();
  }, [consultarWhatsapp]);

  const alertas = useMemo(
    () => alertasDaEmpresa(empresa, detalhe.agora, whatsapp ?? undefined),
    [empresa, detalhe.agora, whatsapp],
  );
  const principal = alertas[0];
  const detalheDaAba = useMemo(() => ({ ...detalhe, empresa }), [detalhe, empresa]);

  /**
   * Uma ação do Financeiro ou das Ações: a rota grava (uma transação com
   * `admin_acoes`) e devolve o cliente relido; a tela troca o que mostra (selo,
   * botões, datas), e por isso não escreve "feito". No preview nada é gravado e o
   * recado diz isso.
   */
  const executar = useCallback(
    async (pedido: PedidoDeAcao): Promise<string | null> => {
      const r = await fonte.mudarConta(pedido);
      if (!r.ok) return r.erro;
      if ("simulado" in r) {
        setRecado("Preview: nada foi gravado.");
        return null;
      }
      if ("recarregue" in r) {
        setRecado("Feito e registrado. Recarregue a página para ver o estado novo.");
        return null;
      }
      setEmpresa(r.empresa);
      setFinanceiro(r.financeiro);
      setRecado(null);
      return null;
    },
    [fonte],
  );

  const abrirEdicaoDoLimite = useCallback((sugestao?: number) => setEditando({ sugestao: sugestao ?? null }), []);
  const limiteMudou = useCallback(
    (limite: number | null) => setEmpresa((cur) => comLimite(cur, limite, detalhe.agora)),
    [detalhe.agora],
  );

  /**
   * O cartão da Visão geral leva à seção "Pedidos em aberto" da aba Atendimento: abre a aba e conta um
   * pedido de rolagem, que a seção atende quando o resto da aba já desenhou.
   */
  const [rolarAtePedidos, setRolarAtePedidos] = useState(0);
  const verPedidos = useCallback(() => {
    setAba("atendimento");
    setVisitadas((cur) => (cur.has("atendimento") ? cur : new Set(cur).add("atendimento")));
    setRolarAtePedidos((n) => n + 1);
  }, []);

  function mudarAba(v: string) {
    if (!ehAbaDoCliente(v)) return;
    setAba(v);
    setVisitadas((cur) => (cur.has(v) ? cur : new Set(cur).add(v)));
  }

  if (apagado) {
    return (
      <Card asChild variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section aria-label={`Cliente ${empresa.nome} apagado`} data-slot="central-apagado" className="p-5">
          <h1 className="text-titulo">{apagado.simulado ? "Preview: nada foi apagado" : `${empresa.nome} foi apagado`}</h1>
          <p className="mt-2 text-apoio text-ink-2">
            O registro do apagamento (quem, quando, nome e id do cliente) ficou guardado.
          </p>
          {apagado.pendencias.length > 0 && (
            <Aviso tom="warn" className="mt-3" data-slot="central-apagado-pendencias">
              <p className="font-semibold">Falta resolver à mão:</p>
              <ul className="mt-1 list-disc pl-5">
                {apagado.pendencias.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Aviso>
          )}
          <Button asChild variant="outline" size="control" className="mt-4">
            <Link href={hrefLista}>
              <ArrowLeft size={14} />
              Voltar para Clientes
            </Link>
          </Button>
        </section>
      </Card>
    );
  }

  return (
    <Card asChild variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <section aria-label={`Cliente ${empresa.nome}`} data-slot="central-detalhe">
        <Tabs value={aba} onValueChange={mudarAba} className="min-h-0 flex-1">
          <div className="border-b border-line px-4 pb-0 pt-3 md:px-5">
            <Button asChild variant="ghost" size="control" className="-ml-2 w-fit">
              <Link href={hrefLista}>
                <ArrowLeft size={14} />
                Clientes
              </Link>
            </Button>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <AvatarCliente e={empresa} size="lg" />
              <h1 data-slot="central-detalhe-nome" className="min-w-0 truncate text-titulo">
                {empresa.nome}
              </h1>
              <SeloSituacao situacao={empresa.situacao} />
              {empresa.situacao.detalhe && empresa.situacao.chave !== "vitalicio" && (
                <span data-slot="central-detalhe-situacao" className="text-apoio font-semibold text-ink-2">
                  {empresa.situacao.detalhe}
                </span>
              )}
              {principal && <ChipAlerta alerta={principal} />}
            </div>
            <TabsList aria-label="Seções do cliente" className="mt-3">
              <TabsTrigger value="visao" data-slot="central-aba-visao-gatilho">
                Visão geral
              </TabsTrigger>
              <TabsTrigger
                value="uso"
                data-slot="central-aba-uso-gatilho"
                onPointerEnter={() => lerDaAba("uso")}
                onPointerDown={() => lerDaAba("uso")}
                onFocus={() => lerDaAba("uso")}
              >
                Uso de IA
              </TabsTrigger>
              <TabsTrigger
                value="atendimento"
                data-slot="central-aba-atendimento-gatilho"
                onPointerEnter={() => lerDaAba("atendimento")}
                onPointerDown={() => lerDaAba("atendimento")}
                onFocus={() => lerDaAba("atendimento")}
              >
                Atendimento
              </TabsTrigger>
              <TabsTrigger value="financeiro" data-slot="central-aba-financeiro-gatilho">
                Financeiro
              </TabsTrigger>
              <TabsTrigger value="acoes" data-slot="central-aba-acoes-gatilho">
                Ações
              </TabsTrigger>
            </TabsList>
            {recado && (
              <p data-slot="central-recado" role="status" className="mt-2 text-legenda text-ink-3">
                {recado}
              </p>
            )}
          </div>

          <AreaRolavel className="min-h-0 flex-1">
            <div className="px-4 py-4 md:px-5">
              <TabsContent value="visao" forceMount>
                <AbaVisaoGeral
                  detalhe={detalheDaAba}
                  cambio={cambio}
                  alertas={alertas}
                  whatsapp={whatsapp}
                  onChecarWhatsapp={checarDeNovo}
                  onVerPedidos={verPedidos}
                />
              </TabsContent>
              <TabsContent value="uso" forceMount>
                {visitadas.has("uso") && (
                  <AbaUsoDeIa
                    fonte={fonte}
                    empresa={empresa}
                    agora={detalhe.agora}
                    modelo={detalhe.modelo}
                    cambio={cambio}
                    cambioBuscando={cambioBuscando}
                  />
                )}
              </TabsContent>
              <TabsContent value="atendimento" forceMount>
                {visitadas.has("atendimento") && (
                  <AbaAtendimento
                    fonte={fonte}
                    pedidos={detalhe.pedidos}
                    agora={detalhe.agora}
                    rolarAtePedidos={rolarAtePedidos}
                  />
                )}
              </TabsContent>
              <TabsContent value="financeiro" forceMount>
                {visitadas.has("financeiro") && (
                  <AbaFinanceiro
                    empresa={empresa}
                    financeiro={financeiro}
                    membros={detalhe.membros}
                    fonte={fonte}
                    executar={executar}
                  />
                )}
              </TabsContent>
              <TabsContent value="acoes" forceMount>
                {visitadas.has("acoes") && (
                  <AbaAcoes
                    empresa={empresa}
                    fonte={fonte}
                    executar={executar}
                    onApagado={setApagado}
                    onEditarLimite={abrirEdicaoDoLimite}
                    aoMudarLimite={limiteMudou}
                  />
                )}
              </TabsContent>
            </div>
          </AreaRolavel>
        </Tabs>

        {editando && (
          <EditarLimiteDialog
            key={empresa.id}
            empresa={empresa}
            sugestao={editando.sugestao}
            fonte={fonte}
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
