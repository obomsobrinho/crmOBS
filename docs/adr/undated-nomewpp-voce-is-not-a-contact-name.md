# `nomewpp = "Você"` is not a contact name
- Date: undated
- Status: Accepted
- Area: data

## Context
Evolution returns `pushName = "Você"` on messages SENT by the owner. That ends up in `dados_cliente.nomewpp` and in message rows.

## Decision
Names are always resolved through `lib/inbox.ts` (`cleanName`, `bestName`): best non-"Você" name in the conversation, otherwise the phone number. Never render `nomewpp` directly.

## Consequences
New screens that show a contact name must reuse these functions. n8n remains owner of `nomewpp`; the CRM owns `display_name`, which takes precedence.
