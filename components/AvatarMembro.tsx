"use client";

import type { ComponentProps } from "react";
import { Avatar } from "@/components/ui/avatar";
import { avatarPair } from "@/lib/inbox";
import { memberInitials } from "@/lib/team";

type TamanhoDoAvatar = NonNullable<ComponentProps<typeof Avatar>["size"]>;

/** Do tamanho `xs` para baixo cabe uma letra só; acima, as duas iniciais. */
const UMA_LETRA: TamanhoDoAvatar[] = ["xs", "2xs", "3xs"];

/**
 * O avatar de um MEMBRO da equipe (02/10/2026): iniciais do nome tiradas do
 * e-mail, na cor derivada do e-mail (`avatarPair`). Estava escrito à mão em seis
 * lugares (equipe, menus de atendente, selo na lista, card do pipeline). Membro
 * não tem foto: quem tem foto é o contato (`AvatarContato`).
 */
export default function AvatarMembro({
  email,
  size,
  style,
  ...props
}: Omit<ComponentProps<typeof Avatar>, "size" | "children"> & {
  email: string;
  size: TamanhoDoAvatar;
}) {
  const ini = memberInitials(email);
  return (
    <Avatar size={size} style={{ ...avatarPair(email), ...style }} {...props}>
      {UMA_LETRA.includes(size) ? ini.slice(0, 1) : ini}
    </Avatar>
  );
}
