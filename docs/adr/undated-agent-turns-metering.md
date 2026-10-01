# agent_turns: one measurement row per AI turn, best-effort, no message content
- Date: undated (Phase 4, agent metering)
- Status: Accepted
- Area: agent-ai

## Context
`/api/agent` computed diagnostics and threw them away. Three questions were guesses: real cost per
conversation, whether the knowledge base is being used, and how many times the guardrail contained
the AI.

## Decision
- `agent_turns` stores **one row per turn** that `/api/agent` processed: `action`, `messages_sent`,
  `silenced` (`nao_publicado`/`assinatura`), RAG (`rag_searched`, `rag_matches`, `rag_top_similarity`),
  guardrail, `latency_ms`, `model`, `input_tokens`, `output_tokens`, `cached_input_tokens` and `dry_run`
  (playground: the token was spent, but operation metrics must filter it out).
- **It does not store message content** (that is `chat_messages`).
- `runAgent` returns `{output, usage, model}` for this.
- Writing is `logTurn` in `lib/agent-turn.ts`, **best-effort and never throws**: measurement must not
  become an attendance error.
- Read by tenant member (RLS), write only service_role.

## Consequences
⚠️ The **plan conversation limit does NOT come from here**: a conversation is a 24h window counted in
`chat_messages` (includes manual), while `agent_turns` is only what the AI processed.
