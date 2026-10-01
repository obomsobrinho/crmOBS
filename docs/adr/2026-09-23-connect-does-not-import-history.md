# `/connect` imports no history; new instances are created with `syncFullHistory: false`
- Date: 2026-09-23
- Status: Accepted
- Area: onboarding

## Context
History import from the Evolution API turned out blocked by data (probing on 27/08: `findMessages` returns `total: 1` per conversation, the whole OBM instance store has 171 messages).

## Decision
Since 23/09/2026 `/connect` does not import history in any way: the `import` route was deleted and a new instance is born with `syncFullHistory: false` (`lib/evolution.ts`). Rows already imported are cleaned by the owner himself, not by the agent.

## Consequences
"Before and after" with imported history stays impossible until a NEW link (full initial sync) is measured. `imported` is never counted as AI reply (`lib/mensagem.ts`).
