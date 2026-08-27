"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "./BrandMark";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import {
  MessagesSquare,
  KanbanSquare,
  LayoutDashboard,
  Bot,
  Users,
  User,
  Calendar,
  Repeat2,
  LogOut,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";

const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  donoOnly?: boolean;
}[] = [
  // Painel PRIMEIRO (26/08/2026): é a tela que prova valor, é o que o dono
  // mostra ao cliente dele, e é onde o empresário julga o produto depois que a
  // novidade passa. A tela INICIAL, porém, depende do papel (ver app/page.tsx):
  // quem trabalha na operação abre em Conversas.
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/inbox", label: "Conversas", icon: MessagesSquare },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/agente", label: "Agente", icon: Bot, donoOnly: true },
  // "Conhecimento" saiu do menu em 26/08/2026, pelo mesmo motivo do Playground:
  // a base de conhecimento virou um bloco dentro do grupo "O que ele sabe" do
  // /agente. O prompt já tratava "detalhes do negócio" e os trechos da base como
  // a MESMA fonte autorizada (seção FONTES E HONESTIDADE), e dois itens irmãos no
  // menu obrigavam o dono a adivinhar em qual tela dizer o que o agente sabe.
  // A rota `/conhecimento` CONTINUA existindo: são 50 linhas que só embrulham o
  // componente, apagar não economiza nada e quebraria link salvo.
  // "Playground" saiu do menu: a bancada de teste virou painel lateral dentro do
  // /agente, porque configurar e testar são a mesma atividade e ter duas telas
  // obrigava a SALVAR (ou seja, publicar) só para testar.
  { href: "/equipe", label: "Equipe", icon: Users },
];

// "Em breve" (26/08/2026). Agenda porque ela saiu do "não construir" e agora vai
// mesmo ser feita (integrando Google Calendar), então a promessa virou verdade.
//
// **Campanhas SAIU.** Manter prometia disparo em massa sobre conexão QR, que é o
// cenário de banimento que o projeto decidiu não correr, e atrai o cliente
// errado logo no beta. Se um dia vier por API Oficial, volta.
//
// **Follow-up e não "Fluxos"**: o cliente final não pensa em fluxo, pensa em
// "falar de novo com quem sumiu". ⚠️ O nome está amarrado a uma regra: o produto
// por trás dele nasce restrito a quem JÁ conversou, nunca lista importada nem
// número frio.
const SOON = [
  { label: "Agenda", icon: Calendar },
  { label: "Follow-up", icon: Repeat2 },
];

export default function NavRail({
  clientName,
  activeHref,
  role,
  whatsappConnected = true,
}: {
  clientName: string;
  /** Só para o preview de design (/design): força o item ativo. */
  activeHref?: string;
  /** Papel do usuário: 'dono' | 'atendente'. Esconde itens só-do-dono. */
  role?: string;
  /** Estado do canal. Hoje chega sempre `true`: consultar a Evolution a cada
      navegação ficou para uma rodada própria, então a faixa existe e está no
      lugar certo, mas ainda não mede nada. */
  whatsappConnected?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadConvos, setUnreadConvos] = useState(0);

  // Restaura o menu recolhido depois de montar. Não dá para ler o localStorage
  // no estado inicial: o servidor não tem localStorage e o HTML sairia com um
  // menu e o cliente com outro. A regra do lint mira renderização em cascata;
  // aqui é leitura única de um sistema externo, que é o caso que o próprio
  // texto da regra permite.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem("nav-collapsed") === "1");
    } catch {
      // sem persistência
    }
  }, []);

  // Contador de conversas não lidas no rail (realtime). O trigger mantém
  // conversations.unread_count; aqui só contamos as conversas com pendência.
  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gt("unread_count", 0);
      setUnreadConvos(count ?? 0);
    };
    void load();
    const channel = supabase
      .channel("rail-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // O listener no `document` para fechar ao clicar fora saiu daqui: quem faz
  // isso agora é o DropdownMenu, junto com Esc, devolução do foco e navegação
  // por seta, que este menu nunca teve.

  const estadoCanal = whatsappConnected
    ? "WhatsApp conectado"
    : "WhatsApp desconectado";

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("nav-collapsed", next ? "1" : "0");
      } catch {
        // ignora
      }
      return next;
    });
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = clientName.slice(0, 2).toUpperCase();
  const perfilActive = pathname.startsWith("/perfil");

  return (
    <Card asChild variant="menu">
      <nav
        className={cn(
          "flex shrink-0 flex-col gap-1 p-2 transition-[width] duration-200 ease-[var(--ease-out)]",
          collapsed ? "w-16 items-center" : "w-[212px]",
        )}
      >
        {/* A própria marca recolhe e expande o menu. Antes havia um botão de
            seta só para isso, o que dava três alvos clicáveis num canto que
            trata de um assunto só. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="rail"
              size="none"
              onClick={toggle}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-expanded={!collapsed}
              className={cn(
                // `text-ink` porque este botão nunca teve cor própria: ele
                // herdava a tinta principal, e a variante `rail` traria ink-2.
                // `mb-2` porque a marca não é um item da lista: com o gap-1 de
                // todos os outros ela encostava em "Conversas" e as duas coisas
                // liam como uma pilha só.
                "mb-2 h-11 rounded-lg text-left text-ink",
                collapsed ? "w-11 justify-center" : "px-2",
              )}
            >
              {collapsed ? <MarkOnly /> : <BrandMark size="sm" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expandir menu" : "Recolher menu"}
          </TooltipContent>
        </Tooltip>

      {NAV.map(({ href, label, icon: Icon, donoOnly }) => {
        // Item só-do-dono some para atendente (role definido e diferente de dono).
        if (donoOnly && role && role !== "dono") return null;
        const active = activeHref
          ? activeHref === href
          : pathname === href || pathname.startsWith(href + "/");
        const unread = href === "/inbox" && unreadConvos > 0;
        const item = (
          <Button
            asChild
            variant="rail"
            size="none"
            className={cn(
              "relative h-10 gap-3 rounded-lg text-corpo font-normal",
              collapsed ? "w-10 justify-center" : "px-3",
              active &&
                "bg-[var(--rail-active-bg)] font-semibold text-ink shadow-[inset_2px_0_0_var(--sel-bar)]",
            )}
          >
            <Link href={href} aria-current={active ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.8} className="shrink-0" />
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate">{label}</span>
              )}
              {/* Expandido, pílula com o número; recolhido, só o ponto. A
                  pílula encolhida virava um círculo escuro sem nada legível
                  dentro. */}
              {unread && !collapsed && (
                <Badge variant="nao-lidas" className="ml-auto">
                  {unreadConvos > 99 ? "99+" : unreadConvos}
                </Badge>
              )}
              {unread && collapsed && (
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--s-menu)] bg-brand-ink" />
              )}
            </Link>
          </Button>
        );
        // Recolhido, o rótulo só existe na dica: é ela que diz o que é cada
        // ícone. Expandido, o rótulo está escrito ao lado e a dica seria eco.
        return collapsed ? (
          <Tooltip key={href}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent side="right">
              {unread ? `${label} (${unreadConvos} não lidas)` : label}
            </TooltipContent>
          </Tooltip>
        ) : (
          <React.Fragment key={href}>{item}</React.Fragment>
        );
      })}

      {SOON.map(({ label, icon: Icon }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className={cn(
                "flex h-10 shrink-0 cursor-not-allowed items-center gap-3 rounded-lg text-corpo text-ink-3 opacity-60",
                collapsed ? "w-10 justify-center" : "px-3",
              )}
            >
              <Icon size={18} strokeWidth={1.8} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{label} (em breve)</TooltipContent>
        </Tooltip>
      ))}

      <div className="relative mt-auto flex w-full flex-col gap-2 pt-2">
        {/* Estado do canal e tema. É o que decide se vale a pena escrever
            qualquer coisa agora, então fica sempre à vista, em vez de escondido
            atrás do avatar. Sem moldura e sem fundo: é um indicador, não um
            botão, e a caixa em volta prometia um clique que não existe. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className={cn(
                "flex h-9 items-center",
                collapsed ? "w-full justify-center px-0" : "gap-2 px-1",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  whatsappConnected ? "bg-human" : "bg-danger",
                )}
              />
              {collapsed ? (
                <span className="sr-only">{estadoCanal}</span>
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-legenda",
                    whatsappConnected ? "text-human-ink" : "text-danger-ink",
                  )}
                >
                  {estadoCanal}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{estadoCanal}</TooltipContent>
        </Tooltip>

        {/* Tema entre o canal e o perfil. Recolhido, fica centralizado como os
            demais alvos da coluna; o perfil é sempre o último item. */}
        <div className={collapsed ? "flex justify-center" : ""}>
          <ThemeToggle collapsed={collapsed} />
        </div>

        {/* O painel abre ACIMA DO BLOCO INTEIRO, não colado no avatar: ele
            cobre o indicador do WhatsApp e o seletor de tema. Antes isso vinha
            de graça, porque o `absolute bottom-full` era do contêiner; o Radix
            ancora no gatilho, então os 104px repõem exatamente a diferença
            (8 do pt-2, 36 do indicador, 8 do gap, 36 do tema, 8 do gap, mais os
            8 do mb-2). São alturas fixas, então a conta não anda. */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="rail"
              size="none"
              className={cn(
                // Idem: herdava a tinta principal, não é um item ghost.
                "gap-2 rounded-lg p-1 text-ink",
                collapsed && "justify-center",
                (perfilActive || menuOpen) && "bg-[var(--rail-hover)]",
              )}
            >
              <Avatar size="sm" className="bg-bloco text-ink-2 ring-1 ring-line">
                {initials}
              </Avatar>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-corpo font-semibold">
                      {clientName}
                    </span>
                    <span className="block text-legenda font-normal text-ink-3">
                      Ver perfil
                    </span>
                  </span>
                  <ChevronUp size={15} className="shrink-0 text-ink-3" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            // Sem sideOffset: fica o padrão (4) da camada base. Era 104, um
            // número mágico posto para o menu não cobrir a faixa "WhatsApp
            // conectado" e o "Tema claro", que ficam logo acima do gatilho. O
            // efeito foi pior que o problema: o painel flutuava solto, a 104px do
            // botão, parecendo estar POR CIMA daqueles itens em vez de ancorado
            // nele. Menu cobrir o que está imediatamente acima é o comportamento
            // normal de um dropdown, e é o que a pessoa espera.
            className={cn(
              "overflow-hidden bg-menu",
              collapsed
                ? "w-48"
                : "w-[var(--radix-dropdown-menu-trigger-width)]",
            )}
          >
            <DropdownMenuItem
              asChild
              className="h-9 px-3 text-apoio hover:bg-[var(--rail-hover)] hover:text-ink focus:bg-[var(--rail-hover)] focus:text-ink"
            >
              <Link href="/perfil">
                <User size={16} /> Perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="perigo"
              onSelect={logout}
              className="h-9 px-3 text-apoio"
            >
              <LogOut size={16} /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </nav>
    </Card>
  );
}

// Só o selo, sem o nome: é o que sobra do BrandMark quando o menu recolhe.
function MarkOnly() {
  return (
    <span className="relative block h-8 w-8 shrink-0" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.markLight}
        alt=""
        width={32}
        height={32}
        className="mark-light h-full w-full object-contain"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.markDark}
        alt=""
        width={32}
        height={32}
        className="mark-dark h-full w-full object-contain"
      />
    </span>
  );
}
