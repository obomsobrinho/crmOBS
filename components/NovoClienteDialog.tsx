"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mascaraTelefoneBR } from "@/lib/format";
import { anunciarContato } from "@/lib/contato-bus";
import { emailValido, mascaraData, telaParaIso, telefoneDoCadastro } from "@/lib/clientes";

// NOVO CLIENTE (fatia B da tela de Clientes, 01/10/2026). Só o telefone é
// obrigatório. Quem grava é `POST /api/contacts` (service_role): o browser não
// tem INSERT em `dados_cliente`. Telefone que já existe abre a ficha existente.
//
// CADASTRAR NÃO ENVIA NADA, e a tela diz isso no rodapé: escrever é o passo
// seguinte, na ficha, com o aviso de bloqueio.
export default function NovoClienteDialog({
  aberto,
  onFechar,
  telefoneInicial = "",
  simular = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** A busca que não achou ninguém, quando ela era um número. */
  telefoneInicial?: string;
  /** Preview `/design/clientes`: valida tudo e não grava. */
  simular?: boolean;
}) {
  const router = useRouter();
  const [telefone, setTelefone] = useState(mascaraTelefoneBR(telefoneInicial));
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [email, setEmail] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<{ campo: string | null; texto: string } | null>(null);

  // Ajuste em tempo de render, não em efeito: abrir de novo com outra busca
  // troca o telefone inicial.
  const [inicialVisto, setInicialVisto] = useState(telefoneInicial);
  if (telefoneInicial !== inicialVisto) {
    setInicialVisto(telefoneInicial);
    setTelefone(mascaraTelefoneBR(telefoneInicial));
  }

  const tel = telefoneDoCadastro(telefone);
  const iso = telaParaIso(nascimento);
  const motivoTelefone = !tel.ok ? tel.motivo : erro?.campo === "telefone" ? erro.texto : null;
  const motivoNascimento = iso === undefined ? "Data inválida." : null;
  const motivoEmail = !emailValido(email) ? "E-mail inválido." : erro?.campo === "email" ? erro.texto : null;

  function fechar() {
    onFechar();
    setTimeout(() => {
      setTelefone("");
      setNome("");
      setNascimento("");
      setEmail("");
      setTentou(false);
      setErro(null);
    }, 200);
  }

  async function salvar() {
    setTentou(true);
    setErro(null);
    if (!tel.ok || iso === undefined || !emailValido(email)) return;
    if (simular) {
      fechar();
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone, nome, email, nascimento: iso }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: number;
        error?: string;
        campo?: string;
      };
      if (!res.ok || typeof data.id !== "number") {
        setErro({ campo: data.campo ?? null, texto: data.error ?? "Não deu para cadastrar agora." });
        return;
      }
      fechar();
      router.push(`/clientes/${data.id}`);
      // A lista de clientes (sem realtime) busca de novo as linhas que tem, em vez
      // de refazer a página inteira (R-15, lib/contato-bus.ts).
      anunciarContato({ phone: null });
    } catch {
      setErro({ campo: null, texto: "Não deu para cadastrar agora. Tente de novo em instantes." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-md" data-slot="novo-cliente">
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogDescription className="mt-2 mb-4">
          Só o telefone é obrigatório. O resto dá para completar depois na ficha.
        </DialogDescription>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="flex flex-col gap-3"
        >
          <Campo rotulo="Telefone (WhatsApp)" motivo={tentou || erro ? motivoTelefone : null}>
            <Input
              data-campo="telefone"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              value={telefone}
              onChange={(e) => {
                setTelefone(mascaraTelefoneBR(e.target.value));
                if (erro?.campo === "telefone") setErro(null);
              }}
              placeholder="(11) 91234-5678"
              aria-invalid={!!(tentou && motivoTelefone)}
            />
          </Campo>
          <Campo rotulo="Nome">
            <Input
              data-campo="nome"
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como a pessoa se chama"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Campo rotulo="Nascimento" motivo={tentou || nascimento.length === 10 ? motivoNascimento : null}>
              <Input
                data-campo="nascimento"
                inputMode="numeric"
                value={nascimento}
                onChange={(e) => setNascimento(mascaraData(e.target.value))}
                placeholder="dd/mm/aaaa"
              />
            </Campo>
            <Campo rotulo="E-mail" motivo={tentou ? motivoEmail : null}>
              <Input
                data-campo="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@exemplo.com"
              />
            </Campo>
          </div>

          {erro && !erro.campo && (
            <p className="text-apoio text-danger-ink" role="alert">
              {erro.texto}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-legenda text-ink-3">
              Cadastrar não envia nada. Escrever é o passo seguinte.
            </span>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="field" className="px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="field"
              className="px-4"
              data-slot="novo-cliente-salvar"
              carregando={salvando}
              disabled={!telefone.trim()}
            >
              Salvar cliente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  rotulo,
  motivo = null,
  children,
}: {
  rotulo: string;
  motivo?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-legenda font-semibold text-ink-2">{rotulo}</span>
      {children}
      {motivo && (
        <span data-slot="novo-cliente-motivo" className="text-legenda text-danger-ink">
          {motivo}
        </span>
      )}
    </label>
  );
}
