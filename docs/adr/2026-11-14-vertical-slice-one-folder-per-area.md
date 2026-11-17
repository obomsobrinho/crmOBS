# Vertical slice: one folder per area, moved when touched

Status: Accepted (owner, 11/11/2026, D6)
Area: engineering

## Decision

- A business area owns `features/<area>/` (components, hooks, api, server, schemas, rules); `app/` keeps thin routes and `lib/` keeps infrastructure.
- An area moves in the step that migrates it, in a commit with only `git mv` and import updates, never mixed with a behavior change, and only when it is touched: no empty skeleton, no bulk move. A small area can be a flat folder.
- Until its move, a new file of an area sits next to that area's current files.
- Lint is an ERROR in `features/**` (inline query keys, `useEffect` that fetches, Supabase imported from a component or hook) and a warning elsewhere (`eslint.config.mjs`).
