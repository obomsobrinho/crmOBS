"use client";

import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarPair, initials } from "@/lib/inbox";
import { urlDaFoto } from "@/lib/fotos";
import { cn } from "@/lib/utils";

/**
 * O avatar de um CONTATO: a foto de perfil do WhatsApp quando existe
 * (`lib/fotos.ts`), senão as iniciais na cor do telefone, como sempre foi.
 * Foto que não carrega cai nas iniciais (o Radix só mostra a imagem depois de
 * carregada). Uma peça só para Conversas, Clientes e a ficha, para a foto
 * aparecer igual nos três.
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
  size: "lg" | "md" | "xs";
  className?: string;
}) {
  const ini = initials(name);
  const marca = ini ?? <User size={16} />;
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
