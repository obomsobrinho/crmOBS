# Brand lives in lib/brand.ts; green, amber and red are state colors only
- Date: undated
- Status: Accepted
- Area: ui

## Context
The CRM is a **by-product of OBS** (O Bom Sobrinho). The product name does not exist yet.

## Decision
- Name, initial and tagline live in `lib/brand.ts`; the badge in `components/BrandMark.tsx` (used in
  login, cadastro, recuperar senha, definir senha, assinatura and nav rail). Changing brand means editing
  that file plus `--accent` and `.brand-grad` in `globals.css`.
- **Green, amber and red are STATE colors** (IA ativa, aviso, bloqueio): never use them as the brand
  accent.
- The CRM inherits the typographic family (Manrope + Space Grotesk) and the purple from OBS; it may have
  its own child brand, provided it derives from the block with "OBS" in negative space.
- **No fixed product name in any component.**

## Consequences
Full color-role rules live in `docs/design-system/`.
