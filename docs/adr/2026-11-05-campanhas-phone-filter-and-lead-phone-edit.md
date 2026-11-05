# Campanhas: filter leads by phone, add a mobile number to a lead, discard non-business categories
- Date: 2026-11-05
- Status: Accepted (owner on 05/11/2026: "mete bronca, são coisas simples"; the cut of the discard list below was read from that message and is his to revisit)
- Area: admin, product

## Context
On 05/11/2026 the owner tested the lead list. Of the 36 leads in the base, 18 have a mobile, 10 a landline
and 8 no phone. A company with no phone makes no sense in his list, and he sometimes finds the number
elsewhere (Instagram). Only a mobile enters a campaign (`telefoneDoLead`); `prospeccao_leads.telefone` is
the mobile key and stays null for a landline, which lives in `telefone_original`.

## Decision
- **Filter**: the leads table gets a Telefone group with three states, `situacaoDoTelefone`
  (`lib/prospeccao.ts`): com celular, só fixo, sem telefone (an invalid number counts as none). The labels
  say which one enters a campaign. Nothing is hidden by default. `p_telefone` in `prospeccao_leads_pagina`
  and `prospeccao_pagina_do_lead` repeats the rule.
- **Edit**: the lead sheet edits the phone, and only the phone. `prospeccao_editar_telefone` is one SQL
  function with its `admin_acoes` row. Only a Brazilian mobile is accepted (`problemaDoCelular`, on screen
  and on the route); a number already on another lead is refused (no duplicate leads).
- **Only a lead with no history** (`leadSemHistorico`) changes number: the cron reads replies and SAIR by the
  lead's number, so changing it after a send would lose them.

- **Discard**: a search with no term brings every place in the area, so `Todas as empresas mutum mg`
  (02/11/2026, 1 km) brought squares and bus stops. `CATEGORIAS_DESCARTADAS` (`lib/fonte-de-leads.ts`) drops
  four real categories in `filtrarPelasOpcoes`, by the MAIN category only, so a snack bar whose second
  category is "Marco histórico" stays. Left out because they can drop good clients: Jardim, Escola,
  Pré-escola, Apartamentos. Squares, churches and the city hall need the source's real category name:
  the X had deleted those leads, and only their names are in `admin_acoes`. A list entry is never a guess.
  Only new searches are affected: no existing lead is deleted.

## Consequences
A new search that finds the lead again keeps the typed number: `prospeccao_concluir_busca` never rewrites
the phone. The phone is not in the score, so the score does not change.
