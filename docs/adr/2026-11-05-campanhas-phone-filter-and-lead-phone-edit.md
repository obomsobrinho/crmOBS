# Campanhas: filter leads by phone and add a mobile number to a lead
- Date: 2026-11-05
- Status: Proposed (the screens await the owner's check; the migration is not applied until he says so)
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

## Consequences
A new search that finds the lead again keeps the typed number: `prospeccao_concluir_busca` never rewrites
the phone. The phone is not in the score, so the score does not change.
