# Perceived value (lib/valor.ts): dependency sentences, four non-negotiable rules
- Date: undated (refined on the 27/08/2026 panel rebuild)
- Status: Accepted
- Area: dashboard

## Context
Attacks churn: the product's value is invisible because the AI answers inside WhatsApp.

## Decision
- `lib/valor.ts` (pure module) turns operation into a dependency sentence ("213 mensagens respondidas
  fora do horário em julho"). It lives in `/painel` (**closed** month with the **accumulated since the
  start** alongside) and in the cancel step of `BillingCheckout` (accumulated).
- **It is the HEADLINE of the panel:** the strongest sentence (`frasesDeValor` already returns in order
  of strength) takes the full width on a brand surface, with the accumulated as second line, and the
  rest goes to the grid.
- An empty closed month **falls back to the accumulated** instead of showing an empty screen (a new
  account is when the customer doubts the product most); in that case the period label becomes
  "desde o início" too, otherwise the title would lie.
- `ValorResumo` **computes nothing**: two opinions about the same number is how an invented number starts.
- In `/painel` the month is **sliced from the accumulated in memory** (by `Date.parse`, never comparing
  ISO as string: the DB returns `+00:00` and `mesFechado` generates `Z`), to avoid requesting the same
  rows twice.
- **Four rules that are not negotiable:**
  1. **Never invent or inflate**, because the customer checks on their own WhatsApp; with no configured
     hours the sentence is **omitted**, and a sentence with zero does not enter.
  2. **Only AI replies count** in "fora do horário" and "fim de semana" (`message_type='manual'` is a
     human working at night, and adding it would inflate the sentence).
  3. Classification in **America/Sao_Paulo** via `Intl`, never UTC (in UTC an evening message becomes
     next day's).
  4. **Holidays: national only**, computed in the module (fixed + Easter-based movable); municipal would
     need per-tenant registration, and guessing would turn a business day into a holiday inside the
     sentence.
- The hours come from `agent_config -> hours`, and the `PUT` of `agent-config` accepts `mode: "horario"`
  to save them **alone** (merge, without touching `persona` or `prompt_mode`): a tenant in advanced mode
  has hand-written persona and the guided form would replace it.

## Consequences
See also `lib/mensagem.ts` for what counts as an AI reply (`imported` is NOT an AI reply).
