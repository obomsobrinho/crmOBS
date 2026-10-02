"use client";

import { User } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  type avatarVariants,
} from "@/components/ui/avatar";
import { avatarPair, initials } from "@/lib/inbox";
import { urlDaFoto } from "@/lib/fotos";
import { cn } from "@/lib/utils";

type TamanhoDoAvatar = NonNullable<VariantProps<typeof avatarVariants>["size"]>;

/**
 * O avatar de um CONTATO: a foto de perfil do WhatsApp quando existe
 * (`lib/fotos.ts`), senão as iniciais na cor do telefone, como sempre foi.
 * Foto que não carrega cai nas iniciais (o Radix só mostra a imagem depois de
 * carregada). Uma peça só para Conversas, Clientes, Pipeline, Pedidos e a
 * ficha, para a foto aparecer igual em todos (02/10/2026: Pipeline e Pedidos
 * desenhavam o `Avatar` à mão e a foto nunca aparecia neles).
 */
export default function AvatarContato({
  phone,
  name,
  fotoPath,
  size,
  className,
}: {
  phone: string;
  name: string | null;
  fotoPath?: string | null;
  size: TamanhoDoAvatar;
  className?: string;
}) {
  const ini = initials(name);
  const marca = ini ?? <User size={size === "xs" ? 14 : 16} />;
  const url = urlDaFoto(fotoPath);
  return (
    <Avatar
      size={size}
      style={avatarPair(phone)}
      className={cn(url && "overflow-hidden", className)}
      data-foto={url ? "sim" : undefined}
    >
      {url ? (
        <>
          <AvatarImage src={url} alt="" className="object-cover" />
          <AvatarFallback>{marca}</AvatarFallback>
        </>
      ) : (
        marca
      )}
    </Avatar>
  );
}
