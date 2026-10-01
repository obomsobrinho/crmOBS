# Decisions kept on purpose: atendimento_ia is text, chat_messages.active is dead
- Date: undated
- Status: Accepted
- Area: data

## Context
Two schema oddities that look like cleanup candidates.

## Decision
`dados_cliente.atendimento_ia` is `text` (`'ativa'`/`'reativada'` = on, `'pause'` = paused), NOT boolean. `chat_messages.active` is a dead legacy column, kept. Do not suggest changing either unless asked.

## Consequences
Code must compare against the text values, never coerce to boolean.
