"use client";

import { useCallback, useState } from "react";
import { Copy, Check, FileText, History, RotateCcw, X } from "lucide-react";
import {
  estimarTokens,
  foraDoCache,
  LIMITS,
  type AgentConfig,
} from "@/lib/agent-prompt";
import { createClient } from "@/lib/supabase/client";
import { fetchMembers, memberName, type Member } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";

// O prompt gerado saiu de coluna fixa da tela para dentro de um painel lateral.
// O motivo é de produto: é o texto que a IA usa, não é o que o cliente veio
// fazer aqui, e 9 KB de prompt em metade da tela empurravam o formulário para
// uma coluna estreita. Quem quiser conferir, abre.
//
// O painel também guarda o histórico de versões. RESTAURAR NÃO GRAVA NADA: ele
// carrega a versão escolhida no formulário, e a pessoa confere e salva. Gravar
// direto daqui seria um segundo caminho de escrita, e um clique errado
// publicaria uma versão velha no WhatsApp de um cliente de verdade.

interface Versao {
  id: number;
  persona: string;
  config: AgentConfig | null;
  prompt_mode: string;
  published_at: string;
  published_by: string | null;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgentPromptDrawer({
  persona,
  onRestore,
  aberto: abertoExterno,
  onAbertoChange,
}: {
  /** Prompt compilado do estado ATUAL do formulário (pode não estar salvo). */
  persona: string;
  /**
   * Carrega uma versão antiga no formulário. Não salva: quem salva é a pessoa,
   * pelo botão do rodapé, depois de conferir.
   */
  onRestore: (v: {
    config: AgentConfig | null;
    persona: string;
    mode: "guiado" | "avancado";
  }) => void;
  /**
   * Controle externo da abertura, para o menu de três pontos do CELULAR abrir
   * este mesmo painel (lá o botão "Ver prompt" não aparece).
   */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
}) {
  const supabase = createClient();
  const [abertoLocal, setAbertoLocal] = useState(false);
  const aberto = abertoExterno ?? abertoLocal;
  const setAberto = (v: boolean) => {
    setAbertoLocal(v);
    onAbertoChange?.(v);
  };
  const [copied, setCopied] = useState(false);
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  const [membros, setMembros] = useState<Record<string, Member>>({});
  // Qual versão está sendo olhada. null = o estado atual do formulário.
  const [vendo, setVendo] = useState<Versao | null>(null);

  const texto = vendo ? vendo.persona : persona;
  const chars = texto.length;
  const tokens = estimarTokens(texto);
  const warn = chars > LIMITS.personaWarn;
  // Curto demais para o cache de prompt pegar. Fica na mesma linha do contador
  // porque é a linha do CUSTO: ali já se diz que o prompt vai em toda mensagem.
  const semCache = chars > 0 && foraDoCache(texto);

  // Busca só ao abrir: histórico é consulta que a maioria nunca vai pedir, e
  // fazer no carregamento seria custo em toda visita a /agente.
  const carregar = useCallback(async () => {
    const [{ data }, lista] = await Promise.all([
      supabase
        .from("agent_publications")
        .select("id, persona, config, prompt_mode, published_at, published_by")
        .order("published_at", { ascending: false })
        .limit(20),
      fetchMembers(supabase),
    ]);
    setVersoes((data ?? []) as Versao[]);
    setMembros(Object.fromEntries(lista.map((m) => [m.userId, m])));
  }, [supabase]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sem clipboard; ignora
    }
  }

  return (
    <Sheet
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setVendo(null); // fechar volta a mostrar o estado atual
        // Buscar aqui, no evento, e não num useEffect: histórico é reação a um
        // gesto da pessoa, não sincronização de estado com sistema externo. O
        // eslint da casa reprova setState dentro de efeito, e com razão.
        if (v && versoes === null) void carregar();
      }}
    >
      <SheetTrigger asChild>
        {/* No celular o botão sai: "Ver prompt" mora nos três pontos. */}
        <Button variant="outline" size="field" className="max-md:hidden">
          <FileText size={15} />
          Ver prompt
        </Button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <SheetTitle>
              {vendo ? `Versão de ${quando(vendo.published_at)}` : "Prompt gerado"}
            </SheetTitle>
            <SheetDescription className="mt-1">
              {vendo
                ? "Você está vendo uma versão antiga."
                : "É o texto exato que a IA recebe em toda mensagem."}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-control" aria-label="Fechar">
              <X size={16} />
            </Button>
          </SheetClose>
        </div>

        {/* Regra da casa: area rolavel dissolve nas bordas. Texto corrido,
            entao o degrau e o padrao. */}
        <AreaRolavel className="min-h-0 flex-1 p-5">
          {/* 12px é o piso da interface, e o prompt não abre exceção. */}
          <pre className="rounded-xl border border-line bg-[var(--input-bg)] p-3.5 font-sans text-legenda leading-[19px] break-words whitespace-pre-wrap text-ink-2">
            {texto || "Preencha os campos para gerar o prompt."}
          </pre>

          <p
            className={`mt-2 text-legenda ${
              warn || semCache ? "text-warn-ink" : "text-ink-3"
            }`}
          >
            {chars.toLocaleString("pt-BR")} caracteres · ~
            {tokens.toLocaleString("pt-BR")} tokens · enviado em toda mensagem
            {warn &&
              ` · perto do teto de ${LIMITS.persona.toLocaleString("pt-BR")} caracteres`}
            {semCache && " · curto demais para a OpenAI reaproveitar entre mensagens"}
          </p>

          {/* Histórico. Sem versão salva ainda, a seção inteira some. */}
          {versoes !== null && versoes.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
                <History size={13} />
                Versões salvas
              </div>
              <ul className="overflow-hidden rounded-xl border border-line">
                {versoes.map((v, i) => {
                  const autor = v.published_by ? membros[v.published_by] : null;
                  const atual = i === 0;
                  return (
                    <li
                      key={v.id}
                      className={`flex items-center gap-2 bg-bloco px-3 py-2.5 ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-apoio tabular-nums">
                          {quando(v.published_at)}
                          {atual && (
                            <span className="ml-2 rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-legenda text-[var(--chip-fg)]">
                              no ar
                            </span>
                          )}
                        </span>
                        <span className="block text-legenda text-ink-3">
                          {autor ? memberName(autor.email) : "alguém do time"} ·{" "}
                          {v.prompt_mode} ·{" "}
                          {v.persona.length.toLocaleString("pt-BR")} caracteres
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="none"
                        className="text-legenda"
                        onClick={() => setVendo(v)}
                      >
                        Ver
                      </Button>
                      {!atual && (
                        <Button
                          variant="outline"
                          size="control"
                          className="gap-1.5"
                          onClick={() => {
                            onRestore({
                              config: v.config,
                              persona: v.persona,
                              mode:
                                v.prompt_mode === "avancado" ? "avancado" : "guiado",
                            });
                            setAberto(false);
                            setVendo(null);
                          }}
                        >
                          <RotateCcw size={13} />
                          Restaurar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-legenda text-ink-3">
                Restaurar carrega a versão no formulário. Nada muda no WhatsApp
                até você salvar.
              </p>
            </div>
          )}
        </AreaRolavel>

        <div className="flex items-center justify-between gap-2 border-t border-line p-4">
          {vendo ? (
            <Button variant="outline" size="field" onClick={() => setVendo(null)}>
              Voltar para o atual
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="outline"
            size="field"
            onClick={copiar}
            className="gap-1.5"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
