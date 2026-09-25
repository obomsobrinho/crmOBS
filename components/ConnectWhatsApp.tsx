"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import LogoutButton from "./LogoutButton";
import ConnectionRiskNotice from "./ConnectionRiskNotice";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCelular } from "@/lib/useCelular";

type Phase = "idle" | "loading" | "waiting" | "connected" | "error";

/**
 * Máscara de celular brasileiro, "(31) 99999-8888", aplicada enquanto digita.
 * Corta em 11 dígitos (DDD + 9 dígitos): sem isso dava para digitar um número
 * gigante (achado do dono, 24/09/2026). O DDI 55 quem põe é o servidor.
 */
function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function ConnectWhatsApp({
  clientId,
  clientName,
  hasInstance,
  enquadramento = "pagina",
  onConectado,
}: {
  clientId: string;
  clientName: string;
  hasInstance: boolean;
  /**
   * `pagina` = a tela `/connect` inteira (moldura de tela cheia, título próprio,
   * botão de sair). `passo` = embutido no último passo do assistente de montagem,
   * onde a moldura, o título e o sair já existem em volta.
   *
   * ⚠️ São duas MOLDURAS do mesmo componente, e não dois componentes: o QR, o
   * polling e o fim da conexão são justamente a parte que não pode existir duas
   * vezes.
   */
  enquadramento?: "pagina" | "passo";
  /**
   * Chamado quando a conexão fecha. Quando existe, ele
   * SUBSTITUI o redirecionamento para o inbox: dentro do assistente, sair da
   * rota no meio da montagem perderia o rascunho e o passo.
   */
  onConectado?: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // CONECTAR PELO NÚMERO (24/09/2026, pedido do dono): quem está no próprio
  // celular não consegue ler um QR na mesma tela, e a Evolution gera um código
  // de 8 caracteres para digitar no WhatsApp. No celular esse é o padrão; no
  // computador o QR continua sendo, e os dois trocam por um link.
  const celular = useCelular();
  const [modoEscolhido, setModo] = useState<"qr" | "numero" | null>(null);
  const modo = modoEscolhido ?? (celular ? "numero" : "qr");
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const onConnected = useCallback(async () => {
    if (doneRef.current) return; // roda uma vez só
    doneRef.current = true;
    stopPolling();
    // ⚠️ NÃO IMPORTA MAIS O HISTÓRICO (23/09/2026, decisão do dono). A conexão
    // por QR entrega o passado pela metade (a Evolution devolve uma mensagem
    // por conversa, medido em 27/08), o painel já ignorava o `imported`, e a
    // conversa aparecia cheia de buracos. A conta começa limpa e se enche com o
    // que chega dali em diante, que é o que a API Oficial também faz. A rota
    // de importação foi APAGADA junto, para não existir caminho de volta.
    setPhase("connected");
    setTimeout(() => {
      // Dentro do assistente quem decide o que vem depois é o assistente: ele
      // mostra a ativação sem trocar de rota, senão o rascunho da montagem e o
      // passo atual iriam junto com a navegação.
      if (onConectado) {
        onConectado();
        return;
      }
      router.replace("/inbox");
      router.refresh();
      // 2,5s e não 1s: a tela agora tem uma frase para ler (o histórico não
      // vem), e em 1s ela sumia antes de alguém terminar a primeira linha.
    }, 2500);
  }, [router, stopPolling, onConectado]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/whatsapp-status`);
        const data = (await res.json()) as { state?: string };
        if (data.state === "open") onConnected();
      } catch {
        // silencioso; próxima tentativa segue
      }
    }, 3000);
  }, [clientId, onConnected, stopPolling]);

  const connect = useCallback(
    async (numero?: string) => {
      setError(null);
      setPhase("loading");
      setQr(null);
      setCodigo(null);
      try {
        const res = await fetch(`/api/clients/${clientId}/connect-whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(numero ? { number: numero } : {}),
        });
        const data = (await res.json()) as {
          qr?: string | null;
          pairingCode?: string | null;
          connected?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Falha ao iniciar a conexão.");
          setPhase("error");
          return;
        }
        if (data.connected) {
          void onConnected();
          return;
        }
        setQr(data.qr ?? null);
        setCodigo(data.pairingCode ?? null);
        setPhase("waiting");
        startPolling();
      } catch {
        setError("Não foi possível contatar o servidor.");
        setPhase("error");
      }
    },
    [clientId, startPolling, onConnected]
  );

  // Se já existe instância, começa checando se ela já está conectada.
  useEffect(() => {
    if (hasInstance) startPolling();
    return () => stopPolling();
  }, [hasInstance, startPolling, stopPolling]);

  const passo = enquadramento === "passo";

  return (
    <div
      className={
        passo
          ? // Dentro do assistente a moldura, o fundo e a rolagem são de fora.
            // Empilhado e não lado a lado: a coluna do assistente tem 672px, e
            // duas colunas ali deixariam o QR com menos de 300px.
            "flex flex-col gap-4"
          : "flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-4 lg:flex-row lg:items-start lg:justify-center lg:py-10"
      }
    >
      <div
        className={cn(
          cardVariants(),
          "space-y-5 p-6 text-center",
          passo ? "w-full" : "w-full max-w-md"
        )}
      >
        {/* Título e sair só na tela própria: no assistente os dois já existem no
            cabeçalho, e repetir daria duas saídas e dois títulos na mesma tela. */}
        {!passo && (
          <div className="flex items-center justify-between">
            <div className="text-left">
              <h1 className="text-titulo">Conectar WhatsApp</h1>
              <p className="text-apoio text-ink-2">{clientName}</p>
            </div>
            <LogoutButton />
          </div>
        )}

        {phase === "connected" ? (
          <div className="space-y-2 py-8">
            <div className="text-3xl">✅</div>
            <p className="font-medium text-human-ink">Tudo pronto!</p>
            {/* Dizer que o passado não vem é o que evita a pessoa procurar
                conversas antigas e achar que perdeu alguma coisa. */}
            {/* No assistente, "as conversas aparecem aqui" confundiria: a pessoa
                ainda não ativou, e o medo que a ordem nova da montagem tira é
                justamente o de conectar e o agente sair respondendo. */}
            <p className="text-apoio text-ink-2">
              {passo
                ? "Número conectado. O agente continua desligado até você ativar."
                : "As conversas aparecem aqui a partir de agora. O histórico continua no seu celular."}
            </p>
          </div>
        ) : (
          <>
            {modo === "numero" ? (
              <>
                <p className="text-apoio text-ink-2">
                  Digite o número do WhatsApp que vai atender. Você recebe um
                  código para digitar no próprio WhatsApp.
                </p>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={numero}
                  onChange={(e) => setNumero(mascaraTelefone(e.target.value))}
                  maxLength={15}
                  placeholder="(31) 99999-8888"
                  aria-label="Número do WhatsApp"
                  className="text-center"
                />
                {codigo && (
                  <div
                    data-slot="codigo-pareamento"
                    className="space-y-2 rounded-xl border border-brand-line bg-brand-surface px-4 py-4"
                  >
                    <p className="font-display text-numero tracking-[0.12em] text-brand-ink">
                      {codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo}
                    </p>
                    <p className="text-apoio text-ink-2">
                      No WhatsApp desse número, abra Aparelhos conectados, toque
                      em Conectar aparelho e depois em Conectar com número de
                      telefone. Digite este código.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-apoio text-ink-2">
                  No WhatsApp que vai atender, abra Aparelhos conectados e
                  escaneie o QR code abaixo.
                </p>
                <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-line-strong bg-bloco p-4">
                  {qr ? (
                    <Image
                      src={qr}
                      alt="QR code do WhatsApp"
                      width={256}
                      height={256}
                      unoptimized
                      className="h-64 w-64 rounded-lg"
                    />
                  ) : phase === "loading" ? (
                    <span className="text-apoio text-ink-3">Gerando QR…</span>
                  ) : (
                    <span className="text-apoio text-ink-3">
                      {hasInstance
                        ? "Aguardando conexão ou gere um novo QR."
                        : "Clique em Conectar para gerar o QR."}
                    </span>
                  )}
                </div>
              </>
            )}

            {phase === "waiting" && (
              <p className="text-legenda text-ink-3">
                Aguardando a conexão… a tela avança sozinha.
              </p>
            )}

            {error && <p className="text-apoio text-danger-ink">{error}</p>}

            <Button
              size="field"
              onClick={() => void connect(modo === "numero" ? numero : undefined)}
              disabled={
                phase === "loading" ||
                // DDD + número: 10 dígitos (fixo) ou 11 (celular).
                (modo === "numero" && numero.replace(/\D/g, "").length < 10)
              }
              className="w-full justify-center max-md:h-11"
            >
              {phase === "loading"
                ? "Gerando…"
                : modo === "numero"
                  ? codigo
                    ? "Gerar novo código"
                    : "Gerar código"
                  : qr
                    ? "Gerar novo QR"
                    : "Conectar WhatsApp"}
            </Button>

            {/* A troca de modo. Muda só o jeito de ligar: a conexão, o polling e
                o que vem depois são os mesmos. */}
            <button
              type="button"
              data-slot="trocar-modo-conexao"
              onClick={() => {
                setModo(modo === "numero" ? "qr" : "numero");
                setError(null);
              }}
              className="text-apoio font-medium text-brand-ink hover:underline"
            >
              {modo === "numero"
                ? "Prefiro ler um QR code"
                : "Conectar pelo número, sem QR code"}
            </button>
          </>
        )}
      </div>

      {/* Transparência sobre o QR: só faz sentido antes de conectar. Depois de
          conectado a tela está de saída, então sai da frente.
          O aviso tem `max-w-md` próprio, que serve à coluna estreita da tela
          própria; no assistente ele acompanha a largura do passo. */}
      {phase !== "connected" && (
        <div className={passo ? "w-full [&>div]:max-w-none" : "contents"}>
          <ConnectionRiskNotice />
        </div>
      )}
    </div>
  );
}
