"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { digitosDoJid, ehGrupo, formatarNumero } from "@/lib/avisos";
import { mascaraTelefoneBR } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// DESTINO DOS AVISOS NO WHATSAPP (29/09/2026, docs/plano-avisos.md).
//
// ⚠️ UM COMPONENTE, DUAS SUPERFÍCIES: o passo 4 da montagem e a aba "O que ele
// pode fazer" do `/agente` usam este mesmo, pela regra "um formulário, duas
// composições".
//
// ⚠️ ELE SALVA SOZINHO, e não no Salvar do formulário do agente (onde o grupo
// antigo morava até 29/09/2026). O "Mandar teste" manda para o destino SALVO e a
// primeira ativação exige destino salvo; com o valor preso no Salvar do
// formulário, a pessoa digitaria, testaria e receberia o teste no destino
// anterior. E na montagem nem existe aquele Salvar no passo 4.
//
// Destino = um NÚMERO (DDI 55 automático) ou um GRUPO escolhido numa lista que
// vem do próprio WhatsApp. Nunca JID digitado.

type Tipo = "numero" | "grupo";
type Grupo = { jid: string; nome: string };

/** Pede a lista de grupos à rota. Sem estado: quem chama decide o que fazer. */
async function buscarGrupos(
  clientId: string
): Promise<{ grupos: Grupo[] } | { erro: string }> {
  try {
    const res = await fetch(`/api/clients/${clientId}/notify-target`);
    const data = (await res.json()) as { grupos?: Grupo[]; error?: string };
    if (!res.ok || !data.grupos) {
      return { erro: primeiraMaiuscula(data.error ?? "não foi possível buscar os grupos.") };
    }
    return { grupos: data.grupos };
  } catch {
    return { erro: "Não foi possível contatar o servidor." };
  }
}

/** Número salvo, no formato que a pessoa digitaria (sem o 55 do Brasil). */
function numeroEditavel(jid: string | null): string {
  const d = digitosDoJid(jid);
  if (!d) return "";
  return mascaraTelefoneBR(
    d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d
  );
}

export default function AvisosCampo({
  clientId,
  initialJid,
  onSalvo,
  avisarSeVazio = false,
  preview = false,
  gruposPreview,
}: {
  clientId: string;
  /** `clients.notify_group_jid` como está no banco. */
  initialJid: string | null;
  /** Avisa o pai (a montagem libera o Ativar com destino salvo). */
  onSalvo?: (jid: string | null) => void;
  /** No `/agente`: aviso âmbar quando não há destino. */
  avisarSeVazio?: boolean;
  /** /design: não fala com o servidor. */
  preview?: boolean;
  /** /design: a lista que o WhatsApp devolveria. */
  gruposPreview?: Grupo[];
}) {
  const [salvo, setSalvo] = useState<string | null>(initialJid);
  const [tipo, setTipo] = useState<Tipo>(ehGrupo(initialJid) ? "grupo" : "numero");
  const [numero, setNumero] = useState(() => numeroEditavel(initialJid));
  const [grupo, setGrupo] = useState<string>(ehGrupo(initialJid) ? initialJid! : "");
  const [grupos, setGrupos] = useState<Grupo[] | null>(gruposPreview ?? null);
  // Destino salvo é um grupo: a lista já nasce carregando (ver o efeito abaixo).
  const [carregandoGrupos, setCarregandoGrupos] = useState(
    !preview && ehGrupo(initialJid)
  );
  const [erroGrupos, setErroGrupos] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);

  async function carregarGrupos() {
    if (preview) return;
    setCarregandoGrupos(true);
    setErroGrupos(null);
    const r = await buscarGrupos(clientId);
    if ("grupos" in r) setGrupos(r.grupos);
    else setErroGrupos(r.erro);
    setCarregandoGrupos(false);
  }

  // Destino salvo é um grupo: a lista vem já, para o nome dele aparecer em vez
  // de um código. Uma vez, na montagem do componente; o estado só muda depois
  // da resposta (o "carregando" já nasceu ligado).
  useEffect(() => {
    if (preview || !ehGrupo(initialJid)) return;
    let vivo = true;
    void buscarGrupos(clientId).then((r) => {
      if (!vivo) return;
      if ("grupos" in r) setGrupos(r.grupos);
      else setErroGrupos(r.erro);
      setCarregandoGrupos(false);
    });
    return () => {
      vivo = false;
    };
  }, [clientId, initialJid, preview]);

  function escolherTipo(t: Tipo) {
    setTipo(t);
    setErro(null);
    if (t === "grupo" && grupos === null && !carregandoGrupos) void carregarGrupos();
  }

  const valorAtual = tipo === "numero" ? numero.trim() : grupo;
  const mudou =
    tipo === "numero"
      ? numero.replace(/\D/g, "") !== numeroEditavel(salvo).replace(/\D/g, "") ||
        ehGrupo(salvo)
      : grupo !== (salvo ?? "");

  async function salvar() {
    setErro(null);
    setTeste(null);
    if (preview) {
      const jid =
        tipo === "grupo" ? grupo : `55${numero.replace(/\D/g, "")}@s.whatsapp.net`;
      setSalvo(jid);
      onSalvo?.(jid);
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/notify-target`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tipo === "numero" ? { numero } : { grupo }),
      });
      const data = (await res.json()) as { jid?: string | null; error?: string };
      if (!res.ok) {
        setErro(data.error ? primeiraMaiuscula(data.error) : "Não foi possível salvar.");
        return;
      }
      const jid = data.jid ?? null;
      setSalvo(jid);
      if (tipo === "numero") setNumero(numeroEditavel(jid));
      onSalvo?.(jid);
    } catch {
      setErro("Não foi possível contatar o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTeste(null);
    if (preview) {
      setTeste({ ok: true, texto: "Enviado. Confira se chegou no WhatsApp." });
      return;
    }
    setTestando(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/notify-target/teste`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      setTeste(
        res.ok
          ? { ok: true, texto: "Enviado. Confira se chegou no WhatsApp." }
          : {
              ok: false,
              texto: data.error
                ? primeiraMaiuscula(data.error)
                : "Não foi possível mandar o teste.",
            }
      );
    } catch {
      setTeste({ ok: false, texto: "Não foi possível contatar o servidor." });
    } finally {
      setTestando(false);
    }
  }

  const nomeDoGrupoSalvo =
    ehGrupo(salvo) ? grupos?.find((g) => g.jid === salvo)?.nome ?? null : null;
  const destinoSalvo = !salvo
    ? null
    : ehGrupo(salvo)
      ? nomeDoGrupoSalvo
        ? `o grupo ${nomeDoGrupoSalvo}`
        : "um grupo do WhatsApp"
      : formatarNumero(digitosDoJid(salvo) ?? "");

  return (
    <div data-slot="avisos" className="space-y-3">
      {/* Número ou grupo. É o MESMO componente das abas do Painel (`Tabs
          variant="painel"`), decisão do dono em 30/09/2026; era um seletor feito
          à mão, com outra cor. A bandeja recua para o canvas porque mora dentro
          de um cartão, como a do movimento no Painel. */}
      <Tabs value={tipo} onValueChange={(v) => escolherTipo(v as Tipo)}>
        <TabsList
          variant="painel"
          className="bg-canvas"
          aria-label="Para onde vão os avisos"
        >
          {(["numero", "grupo"] as const).map((t) => (
            <TabsTrigger key={t} value={t} variant="painel" data-slot="avisos-tipo">
              {t === "numero" ? "Um número" : "Um grupo"}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-start gap-2">
        {tipo === "numero" ? (
          <Input
            data-slot="avisos-numero"
            value={numero}
            onChange={(e) => {
              setNumero(mascaraTelefoneBR(e.target.value));
              setErro(null);
            }}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            aria-label="Número que recebe os avisos"
            aria-invalid={erro ? true : undefined}
            className="min-w-0 flex-1 basis-56"
          />
        ) : grupos && grupos.length > 0 ? (
          <Select
            value={grupo || undefined}
            onValueChange={(v) => {
              setGrupo(v);
              setErro(null);
            }}
          >
            {/* Sem data-slot aqui: o da base é escrito depois do spread e
                venceria (regra 4). O teste acha pelo nome acessível. */}
            <SelectTrigger
              size="field"
              aria-label="Grupo que recebe os avisos"
              className="min-w-0 flex-1 basis-56"
            >
              <SelectValue placeholder="Escolha o grupo" />
            </SelectTrigger>
            <SelectContent>
              {grupos.map((g) => (
                <SelectItem key={g.jid} value={g.jid}>
                  {g.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex min-h-[var(--h-field)] min-w-0 flex-1 basis-56 items-center gap-2 text-apoio text-ink-2">
            {carregandoGrupos ? (
              "Buscando os grupos do seu WhatsApp…"
            ) : erroGrupos ? (
              <>
                <span data-slot="avisos-sem-grupos">{erroGrupos}</span>
                <Button variant="brand-ghost" size="chrome" onClick={carregarGrupos}>
                  Tentar de novo
                </Button>
              </>
            ) : grupos ? (
              <span data-slot="avisos-sem-grupos">
                O número do agente não está em nenhum grupo. Crie um grupo com
                quem vai receber os avisos e adicione o número do agente.
              </span>
            ) : null}
          </div>
        )}

        <Button
          size="field"
          variant="outline"
          data-slot="avisos-salvar"
          onClick={salvar}
          carregando={salvando}
          disabled={!valorAtual || !mudou}
        >
          Salvar destino
        </Button>
      </div>

      {erro ? (
        <p role="alert" className="text-legenda text-danger-ink">
          {erro}
        </p>
      ) : (
        <p className="text-legenda text-ink-3">
          {tipo === "grupo" && grupos && grupos.length > 0 && (
            <Button
              variant="brand-ghost"
              size="none"
              data-slot="avisos-atualizar-grupos"
              onClick={carregarGrupos}
              disabled={carregandoGrupos}
              className="float-right ml-2 rounded-sm px-1 text-legenda font-semibold"
            >
              Atualizar lista
            </Button>
          )}
          {tipo === "numero"
            ? "O número de quem vai responder, com DDD. Não pode ser o número do agente."
            : "A lista mostra os grupos em que o número do agente está (não os do seu celular pessoal). Para usar outro grupo, adicione o número do agente nele e atualize a lista."}
        </p>
      )}

      {destinoSalvo ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p
            data-slot="avisos-destino"
            className="flex items-center gap-1.5 text-apoio text-ink-2"
          >
            <Check size={15} className="shrink-0 text-human-ink" aria-hidden />
            <span>
              Os avisos vão para <strong className="font-semibold text-ink">{destinoSalvo}</strong>.
            </span>
          </p>
          <Button
            variant="brand-ghost"
            size="chrome"
            data-slot="avisos-teste"
            onClick={testar}
            carregando={testando}
          >
            <Send size={13} />
            Mandar teste
          </Button>
        </div>
      ) : (
        avisarSeVazio && (
          <p
            data-slot="avisos-vazio"
            className="flex items-start gap-1.5 text-legenda text-warn-ink"
          >
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>
              Sem isto, ninguém fica sabendo quando a IA pedir ajuda.
            </span>
          </p>
        )
      )}

      {teste && (
        <p
          data-slot="avisos-resultado-teste"
          role="status"
          className={cn(
            "text-legenda",
            teste.ok ? "text-human-ink" : "text-danger-ink"
          )}
        >
          {teste.texto}
        </p>
      )}
    </div>
  );
}

// As mensagens da rota começam em minúscula (convenção das rotas da casa); na
// tela, frase começa em maiúscula.
function primeiraMaiuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
