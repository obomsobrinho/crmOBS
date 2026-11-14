"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";

/**
 * Formulário da camada base (D5, docs/plano-dados-e-estado.md 2.12): o `Form` do
 * shadcn sobre react-hook-form, com o esquema Zod da área pelo resolver. Só para
 * formulário NOVO ou complexo (mais de um par de campos, validação entre campos,
 * lista de campos); busca e renomear continuam um campo controlado. Nenhum
 * formulário que já funciona foi migrado.
 *
 * O campo em si é o de sempre (`Input`, `Select`, `Textarea`, `Switch`,
 * `Checkbox`); daqui vêm o rótulo, a ligação de acessibilidade (`id`,
 * `aria-describedby`, `aria-invalid`) e a mensagem do esquema embaixo.
 * Exemplo: docs/design-system/camada-base.md, seção "Formulário".
 */
const Form = FormProvider;

type ContextoDoCampo = { name: string };
const CampoContexto = React.createContext<ContextoDoCampo | null>(null);
const ItemContexto = React.createContext<{ id: string } | null>(null);

function FormField<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>(
  props: ControllerProps<TFieldValues, TName>
) {
  return (
    <CampoContexto.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </CampoContexto.Provider>
  );
}

function useCampo() {
  const campo = React.useContext(CampoContexto);
  const item = React.useContext(ItemContexto);
  const { getFieldState } = useFormContext();
  const estado = useFormState({ name: campo?.name });
  if (!campo || !item) throw new Error("useCampo fora de <FormField> e <FormItem>");
  const fieldState = getFieldState(campo.name, estado);
  return {
    name: campo.name,
    idDoCampo: `${item.id}-campo`,
    idDaDescricao: `${item.id}-descricao`,
    idDaMensagem: `${item.id}-mensagem`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  return (
    <ItemContexto.Provider value={{ id }}>
      <div className={cn("flex flex-col gap-1.5", className)} {...props} data-slot="form-item" />
    </ItemContexto.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<"label">) {
  const { error, idDoCampo } = useCampo();
  return (
    <label
      htmlFor={idDoCampo}
      data-erro={!!error || undefined}
      className={cn("text-apoio font-semibold text-ink data-[erro]:text-danger-ink", className)}
      {...props}
      data-slot="form-label"
    />
  );
}

function FormControl(props: React.ComponentProps<typeof Slot.Root>) {
  const { error, idDoCampo, idDaDescricao, idDaMensagem } = useCampo();
  return (
    <Slot.Root
      id={idDoCampo}
      aria-describedby={error ? `${idDaDescricao} ${idDaMensagem}` : idDaDescricao}
      aria-invalid={!!error}
      {...props}
      data-slot="form-control"
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { idDaDescricao } = useCampo();
  return <p id={idDaDescricao} className={cn("text-legenda text-ink-3", className)} {...props} data-slot="form-description" />;
}

/** A frase do esquema quando o campo está errado (estado de erro de campo, 7.1). */
function FormMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  const { error, idDaMensagem } = useCampo();
  const corpo = error ? String(error.message ?? "") : children;
  if (!corpo) return null;
  return (
    <p id={idDaMensagem} className={cn("text-legenda text-danger-ink", className)} {...props} data-slot="form-message">
      {corpo}
    </p>
  );
}

export { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage };
