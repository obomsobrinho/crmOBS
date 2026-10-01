"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import { anunciarContato } from "@/lib/contato-bus";
import {
  customFieldsToList,
  listToCustomFields,
  type CustomField,
} from "@/lib/crm";
import {
  emailValido,
  isoParaTela,
  mascaraData,
  telaParaIso,
} from "@/lib/clientes";

// "Dados": nome de exibição (display_name, precede o pushName do WhatsApp) e
// campos personalizados (custom_fields jsonb). Escrita direta na dados_cliente
// (grant de coluna). Só quando a linha do contato existe.
//
// Edição NO LUGAR: cada linha é o próprio campo, e grava quando perde o foco.
// O modo anterior era um botão "Editar" que trocava a lista inteira por um
// formulário com Cancelar e Salvar, ou seja, três cliques para corrigir uma
// letra.
//
// ⚠️ APARÊNCIA REFEITA EM 18/09/2026 pelo desenho aprovado. O bloco era uma
// lista de linhas soltas com o valor colado no rótulo; agora é uma TABELA de
// pares: rótulo fixo de 86px à esquerda em tinta de apoio, valor ALINHADO À
// DIREITA em tinta principal e peso 600, e um fio de 1px fechando cada linha.
// O alinhamento à direita é o que faz a coluna ler como cadastro e não como
// texto corrido: os valores formam uma segunda margem, e o olho compara "QR
// Code" com "Plano anual" sem ter que atravessar o rótulo.
// O cabeçalho do bloco também mudou: o rótulo "DADOS" ganhou um FILETE que
// ocupa o resto da linha, que é o que separa um bloco do outro agora que a
// coluna não tem mais borda entre seções.
//
// ⚠️ AFFORDANCE CORRIGIDA EM 19/09/2026, e ela NÃO desfaz a tabela de pares: o
// rótulo continua à esquerda, o valor à direita e o fio fecha cada linha. O que
// mudou é que o valor virou um campo VISÍVEL antes do clique (variante `sutil`
// do Input, moldura discreta na altura de controle), porque o dono disse
// "custei perceber que podia digitar ali". Campo que só vira campo depois do
// clique não convida ninguém a clicar, que é a definição do problema.
export default function ContactFields({
  phone,
  initialDisplayName,
  initialCustomFields,
  initialEmail = null,
  initialBirthDate = null,
  editable,
}: {
  phone: string;
  initialDisplayName: string | null;
  initialCustomFields: Json | null;
  /** Nascimento e e-mail entraram com a tela de Clientes (30/09/2026, D1 = B).
   *  CPF ficou de fora de propósito (LGPD). */
  initialEmail?: string | null;
  /** AAAA-MM-DD, como o banco guarda. */
  initialBirthDate?: string | null;
  editable: boolean;
}) {
  const supabase = createClient();
  const [name, setName] = useState(initialDisplayName ?? "");
  const [fields, setFields] = useState<CustomField[]>(
    customFieldsToList(initialCustomFields)
  );
  const [email, setEmail] = useState(initialEmail ?? "");
  const [nascimento, setNascimento] = useState(isoParaTela(initialBirthDate));
  const [status, setStatus] = useState<
    "idle" | "salvando" | "salvo" | "erro" | "data" | "email"
  >("idle");

  // O que já está no banco, para não gravar a cada foco perdido sem mudança.
  const gravado = useRef(
    marca(
      initialDisplayName ?? "",
      customFieldsToList(initialCustomFields),
      initialEmail ?? "",
      isoParaTela(initialBirthDate)
    )
  );

  if (!editable) return null;

  const cheios = [name.trim(), nascimento.trim(), email.trim()].filter(Boolean).length;
  const completude = cheios === 3 ? "Completo" : `${cheios} de 3 preenchidos`;

  function setField(i: number, patch: Partial<CustomField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function salvar(nome: string, lista: CustomField[]) {
    const atual = marca(nome, lista, email, nascimento);
    if (atual === gravado.current) return;
    // Valor que não dá para gravar fica NA TELA, com o motivo, e nada vai ao
    // banco: gravar meia data ou um e-mail sem arroba seria dado inventado.
    const birth = telaParaIso(nascimento);
    if (birth === undefined) {
      setStatus("data");
      return;
    }
    if (!emailValido(email)) {
      setStatus("email");
      return;
    }
    setStatus("salvando");
    const { error } = await supabase
      .from("dados_cliente")
      .update({
        display_name: nome.trim() || null,
        custom_fields: listToCustomFields(lista),
        email: email.trim() || null,
        birth_date: birth,
      })
      .eq("telefone", phone);
    if (error) {
      setStatus("erro");
      return;
    }
    gravado.current = atual;
    setStatus("salvo");
    // Cabeçalho, ficha e lista corrigem o próprio nome pelo barramento, sem
    // refazer a página inteira (R-15, lib/contato-bus.ts).
    anunciarContato({ phone, nome: nome.trim() || null });
  }

  function remover(i: number) {
    const lista = fields.filter((_, idx) => idx !== i);
    setFields(lista);
    void salvar(name, lista);
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      <CabecalhoBloco rotulo="Dados">
        {status !== "idle" ? (
          <span
            data-slot="painel-dados-status"
            className={`shrink-0 text-legenda font-normal ${
              status === "salvando" || status === "salvo"
                ? "text-ink-3"
                : "text-danger-ink"
            }`}
          >
            {status === "salvando"
              ? "salvando"
              : status === "salvo"
                ? "salvo"
                : status === "data"
                  ? "data inválida"
                  : status === "email"
                    ? "e-mail inválido"
                    : "não deu para salvar"}
          </span>
        ) : (
          // O CONVITE A COMPLETAR, sem cobrar (desenho de Clientes): só a
          // contagem, em tinta de apoio. Nada de cor de aviso nem faixa.
          <span
            data-slot="painel-completude"
            className="shrink-0 text-legenda font-normal text-ink-3"
          >
            {completude}
          </span>
        )}
      </CabecalhoBloco>

      <div className="flex flex-col">
        {/* ⚠️ O placeholder CONVIDA, e não descreve. Eram "Como você chama este
            contato" e "Não informado": o primeiro é uma explicação longa demais
            para caber num campo de 152px, e o segundo é um laudo, que é
            exatamente o que faz a linha ler como texto e não como campo. */}
        <Linha
          rotulo="Nome"
          valor={name}
          placeholder="Adicionar nome"
          onChange={setName}
          onCommit={() => void salvar(name, fields)}
        />
        <Linha
          rotulo="Nascimento"
          valor={nascimento}
          placeholder="Adicionar data"
          inputMode="numeric"
          onChange={(v) => setNascimento(mascaraData(v))}
          onCommit={() => void salvar(name, fields)}
        />
        <Linha
          rotulo="E-mail"
          valor={email}
          placeholder="Adicionar e-mail"
          inputMode="email"
          onChange={setEmail}
          onCommit={() => void salvar(name, fields)}
        />

        {fields.map((f, i) => (
          <Linha
            key={i}
            rotulo={f.key}
            rotuloEditavel
            onRotulo={(v) => setField(i, { key: v })}
            valor={f.value}
            placeholder="Adicionar"
            onChange={(v) => setField(i, { value: v })}
            onCommit={() => void salvar(name, fields)}
            onRemover={() => remover(i)}
          />
        ))}
      </div>

      {/* "+ Adicionar campo": moldura TRACEJADA na largura da tabela.
          ⚠️ ISTO VOLTOU ATRÁS DE PROPÓSITO (19/09/2026). Em 18/09 ele virou ação
          de texto sem moldura, e o argumento era que num bloco de linhas sem
          moldura nenhuma um botão emoldurado lia como o elemento mais pesado do
          bloco. Esse argumento se inverteu quando as linhas ganharam moldura:
          agora o texto solto é que lê como rodapé, e ele é o único jeito de
          criar campo. Tracejado, e não cheio, porque a linha ainda não existe: é
          o mesmo vocabulário do chip "Ninguém assumiu ainda" no cabeçalho. */}
      <Button
        variant="outline"
        onClick={() => setFields((f) => [...f, { key: "", value: "" }])}
        className="mt-1 w-full border-dashed text-apoio font-semibold text-ink-2 hover:border-line-strong hover:text-ink"
      >
        + Adicionar campo
      </Button>
    </div>
  );
}

/**
 * Cabeçalho de bloco da coluna: rótulo em caixa alta, filete ocupando o resto da
 * linha e, opcionalmente, uma ação ou um estado na ponta direita.
 *
 * ⚠️ Vive aqui e não em `components/ui/` porque é a moldura DESTA coluna, e a
 * camada base só recebe o que já apareceu em mais de uma tela. `ContactNotes`
 * importa daqui, que é o que impede as duas cabeças de divergirem no primeiro
 * ajuste.
 * O filete é `line-soft` (o divisor INTERNO de cartão) e não `line`: com a linha
 * de borda de cartão ele lia como fim de tabela, e não como continuação do
 * rótulo.
 */
export function CabecalhoBloco({
  rotulo,
  children,
}: {
  rotulo: string;
  children?: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-[7px]">
      <span className="shrink-0 text-rotulo uppercase text-ink-3">
        {rotulo}
      </span>
      <span aria-hidden className="h-px min-w-3 flex-1 bg-line-soft" />
      {children}
    </span>
  );
}

// Assinatura do que de fato vai para o banco (chave vazia é descartada por
// listToCustomFields, então uma linha em branco recém-criada não conta).
function marca(
  nome: string,
  lista: CustomField[],
  email: string,
  nascimento: string
): string {
  return JSON.stringify([
    nome.trim(),
    listToCustomFields(lista),
    email.trim(),
    nascimento.trim(),
  ]);
}

function Linha({
  rotulo,
  rotuloEditavel,
  onRotulo,
  valor,
  placeholder,
  onChange,
  onCommit,
  onRemover,
  inputMode,
}: {
  inputMode?: "numeric" | "email";
  rotulo: string;
  rotuloEditavel?: boolean;
  onRotulo?: (v: string) => void;
  valor: string;
  placeholder: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onRemover?: () => void;
}) {
  return (
    <div
      data-slot="painel-dado"
      className="group flex items-center gap-2.5 border-b border-line-soft py-1"
    >
      {rotuloEditavel ? (
        <Input
          variant="sutil"
          value={rotulo}
          onChange={(e) => onRotulo?.(e.target.value)}
          onBlur={onCommit}
          placeholder="Nome do campo"
          aria-label="Nome do campo"
          className="w-[86px] shrink-0 text-legenda font-normal text-ink-3"
        />
      ) : (
        <span className="w-[86px] shrink-0 text-legenda font-normal text-ink-3">
          {rotulo}
        </span>
      )}
      <Input
        variant="sutil"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-label={rotulo || "Valor do campo"}
        className="w-auto flex-1 text-right font-semibold text-ink placeholder:font-normal placeholder:text-ink-3"
      />
      {/* GUTTER FIXO de 12px, presente até na linha do Nome, que não tem o que
          remover. É ele que mantém TODOS os valores na mesma margem direita:
          sem o espaço vazio, a linha com botão terminaria 20px antes das
          outras, e o alinhamento à direita, que é o ponto do desenho, se perde
          justamente nas linhas que o dono do CRM criou. */}
      <span className="flex w-3 shrink-0 justify-center">
        {onRemover && (
          <Button
            variant="ghost"
            size="none"
            onClick={onRemover}
            aria-label="Remover campo"
            className="rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-transparent hover:text-danger-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X size={12} />
          </Button>
        )}
      </span>
    </div>
  );
}
