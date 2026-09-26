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
import { ChevronRight } from "lucide-react";

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
          "space-y-5 p-6",
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
          <div className="space-y-2 py-8 text-center">
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
          // ⚠️ REFEITO EM 26/09/2026 NO MOLDE DO WHATSAPP WEB (pedido do dono,
          // com print): três passos numerados, o código ao lado e a troca de
          // modo num link. Antes eram quatro frases soltas dizendo quase a mesma
          // coisa, e um botão "Conectar WhatsApp" que na verdade só GERAVA o QR.
          //
          // A coluna da esquerda tem a altura do código e se divide em duas
          // pontas (segunda rodada, "preencha melhor a parte de baixo"): os
          // passos em cima e, encostados embaixo, o aviso do número dedicado e a
          // troca de modo, onde o WhatsApp Web põe "Precisa de ajuda?".
          <>
            <div
              className={cn(
                "flex flex-col gap-6 text-left",
                passo && "sm:flex-row sm:items-stretch sm:justify-between"
              )}
            >
              {/* Empilhado (celular, e a tela /connect, que é estreita) a coluna
                  some (`contents`) e a troca de modo com o aviso vai para o FIM,
                  depois do código: senão o código ficava embaixo do aviso. */}
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col justify-between gap-6",
                  passo ? "max-sm:contents" : "contents"
                )}
              >
                {modo === "numero" ? (
                  <PassosNumerados
                    itens={[
                      <div key="n">
                        <span>Digite o número que vai atender</span>
                        <div className="mt-3 flex gap-2">
                          <Input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={numero}
                            onChange={(e) => setNumero(mascaraTelefone(e.target.value))}
                            maxLength={15}
                            placeholder="(31) 99999-8888"
                            aria-label="Número do WhatsApp"
                            className="min-w-0 flex-1"
                          />
                          <Button
                            size="field"
                            onClick={() => void connect(numero)}
                            carregando={phase === "loading"}
                            // DDD + número: 10 dígitos (fixo) ou 11 (celular).
                            disabled={numero.replace(/\D/g, "").length < 10}
                            className="max-md:h-11"
                          >
                            {codigo ? "Gerar outro" : "Gerar código"}
                          </Button>
                        </div>
                      </div>,
                      <span key="w">
                        No WhatsApp desse número, toque em{" "}
                        <b>Aparelhos conectados</b>, <b>Conectar aparelho</b> e{" "}
                        <b>Conectar com número de telefone</b>
                      </span>,
                      <span key="c">Digite o código que aparecer aqui</span>,
                    ]}
                  />
                ) : (
                  <PassosNumerados
                    itens={[
                      <span key="a">Abra o WhatsApp no celular do número que vai atender</span>,
                      <span key="b">
                        Toque em <b>Aparelhos conectados</b> e depois em{" "}
                        <b>Conectar aparelho</b>
                      </span>,
                      <span key="c">Aponte a câmera para o QR code</span>,
                    ]}
                  />
                )}

                <div className={cn("space-y-3", passo ? "max-sm:order-last" : "order-last")}>
                  {/* A troca de modo muda só o jeito de ligar: a conexão, o
                      polling e o que vem depois são os mesmos. */}
                  <button
                    type="button"
                    data-slot="trocar-modo-conexao"
                    onClick={() => {
                      setModo(modo === "numero" ? "qr" : "numero");
                      setError(null);
                    }}
                    className="flex items-center gap-1 text-apoio font-medium text-brand-ink hover:underline"
                  >
                    {modo === "numero"
                      ? "Conectar com QR code"
                      : "Conectar com número de telefone"}
                    <ChevronRight size={15} aria-hidden />
                  </button>
                  {/* Transparência sobre a conexão, dentro do cartão: é a nota
                      de rodapé dos passos, não um bloco à parte. */}
                  <div className="[&>div]:max-w-none [&>div]:px-0">
                    <ConnectionRiskNotice />
                  </div>
                </div>
              </div>

              {modo === "numero" ? (
                <div
                  data-slot="codigo-pareamento"
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-xl px-5 py-6 sm:w-[248px]",
                    codigo
                      ? "border border-brand-line bg-brand-surface"
                      : "border border-dashed border-line-strong bg-bloco"
                  )}
                >
                  {codigo ? (
                    <p className="font-display text-numero tracking-[0.12em] text-brand-ink">
                      {codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo}
                    </p>
                  ) : (
                    <span className="text-apoio text-ink-3">O código aparece aqui</span>
                  )}
                </div>
              ) : (
                <div className="flex shrink-0 flex-col items-center gap-2 self-center">
                  <div className="flex size-[248px] items-center justify-center rounded-xl border border-dashed border-line-strong bg-bloco">
                    {qr ? (
                      <QrDaMarca src={qr} />
                    ) : (
                      <Button
                        size="field"
                        onClick={() => void connect()}
                        carregando={phase === "loading"}
                        className="max-md:h-11"
                      >
                        {phase === "loading" ? "Gerando…" : "Gerar QR code"}
                      </Button>
                    )}
                  </div>
                  {/* O QR do WhatsApp vence em segundos: gerar outro fica à
                      mão, discreto, embaixo do código. */}
                  {qr && (
                    <Button
                      variant="ghost"
                      size="chrome"
                      onClick={() => void connect()}
                      carregando={phase === "loading"}
                    >
                      Gerar outro
                    </Button>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-apoio text-danger-ink">{error}</p>}
          </>
        )}
      </div>

    </div>
  );
}

/**
 * Os passos numerados do WhatsApp Web: círculo com o número e um fio ligando um
 * ao outro. Uma frase por passo, e o que é nome de tela do WhatsApp em negrito,
 * que é o que a pessoa procura no celular.
 */
function PassosNumerados({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol data-slot="passos-conexao" className="min-w-0 flex-1">
      {itens.map((item, i) => (
        <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
          {i < itens.length - 1 && (
            <span
              aria-hidden
              className="absolute top-7 bottom-0 left-[13px] w-px bg-line-strong"
            />
          )}
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-legenda font-semibold text-ink-2">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5 text-corpo text-ink [&_b]:font-semibold">
            {item}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * O QR da Evolution no ROXO da marca (26/09/2026, dono: "esse verde tá perdido
 * aqui"). A Evolution entrega uma imagem pronta, com os módulos em verde; aqui
 * ela é redesenhada num canvas trocando cada pixel escuro pela cor da marca e
 * cada claro por branco.
 *
 * ⚠️ Por que canvas e não `filter: hue-rotate`: girar o matiz dependeria do
 * verde exato que a Evolution usa (e muda de versão para versão), e um tom que
 * saísse claro demais deixaria o QR ilegível para a câmera. Aqui a regra é por
 * LUMINOSIDADE: escuro vira `--brand-fill` (6,9:1 contra o branco no claro,
 * 5,8:1 no escuro, ambos acima do que um leitor de QR precisa), claro vira
 * branco. O contraste do código não depende de palpite sobre a cor de origem.
 * Se o canvas falhar, cai na imagem original.
 */
function QrDaMarca({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return setFalhou(true);
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      const cor = getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-fill")
        .trim();
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(cor);
      const [r, g, b] = m
        ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
        : [107, 33, 232];
      try {
        const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = dados.data;
        for (let i = 0; i < px.length; i += 4) {
          const luz = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          const escuro = px[i + 3] > 128 && luz < 170;
          px[i] = escuro ? r : 255;
          px[i + 1] = escuro ? g : 255;
          px[i + 2] = escuro ? b : 255;
          px[i + 3] = 255;
        }
        ctx.putImageData(dados, 0, 0);
      } catch {
        setFalhou(true);
      }
    };
    img.onerror = () => setFalhou(true);
    img.src = src;
  }, [src]);

  if (falhou) {
    return (
      <Image
        src={src}
        alt="QR code do WhatsApp"
        width={232}
        height={232}
        unoptimized
        className="size-[232px] rounded-lg"
      />
    );
  }
  return (
    <canvas
      ref={canvasRef}
      data-slot="qr-marca"
      role="img"
      aria-label="QR code do WhatsApp"
      className="size-[232px] rounded-lg"
    />
  );
}
