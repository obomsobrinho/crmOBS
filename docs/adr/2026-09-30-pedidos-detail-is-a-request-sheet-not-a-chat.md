# /pedidos: the detail is the request sheet, never a chat
- Date: 2026-09-30
- Status: Accepted (rebuilt 2026-09-30, `docs/plano-fechar-p0.md`, `components/Pedidos.tsx`; first version 2026-09-29, `docs/plano-pedidos.md`)
- Area: product

## Context
`/pedidos` lists help requests. Owner on a chat-style detail: "como se eu estivesse em Conversas, não faz sentido".

## Decision
- List on the left with tabs **Abertos** (OLDEST first, owner decision) and **Resolvidos** (last 30 days, most recent first, with how it closed, the instruction given and who resolved), search by client or by what was asked, and the selected request beside it.
- ⚠️ The detail is the request SHEET, NEVER a chat: summary, wait, "2 de 3 nesta conversa", **Orientar a IA** and **Resolvido**, and "Abrir conversa" for those who want the messages. Replying happens in the conversation.
- ⚠️ No new path: orient and Resolvido call `/orientar` and `/resolve`. A blocked account sees read only.
- Menu: "Pedidos" between Painel and Conversas with an amber number (badge `pedidos`); on mobile, in the bottom bar in place of Pipeline (which moved to "Mais"). Pure rule in `lib/pedidos.ts`.
- ⚠️ Login does NOT return to the requested link, on purpose (owner: it is security, and the person must see the whole queue anyway).
