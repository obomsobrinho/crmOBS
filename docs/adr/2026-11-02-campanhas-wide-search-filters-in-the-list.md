# Campanhas: the search brings every company in the area, the filters live in the leads table, spreadsheets can be imported
- Date: 2026-11-02
- Status: Accepted (owner, 02/11/2026, after the first real search)
- Area: product, admin

## Context
The first real search (Mutum, MG, 02/11/2026, 5 km) came back with zero places. The owner had typed
"testes clinicas" in "O que buscar" thinking it was a NAME for the search; it was the Google Maps search
term. While aligning, the owner set the model:

- In a small city many companies are badly categorized on Google. Searching by category (or by a segment
  term) loses exactly the clinic that did not fill its profile. The Apify actor itself warns that
  `categoryFilterWords` gives false negatives and asks for every synonym.
- Rating, site and reviews were applied on OUR side after the source had already charged every place
  (`filtrarPelasOpcoes`): he paid for 50 and could see 10.
- He wants to pick by name, inside the result, and filter the list freely afterwards.
- He also wants to import his own contact lists (Excel) into a campaign.

Facts read from the actor's public API on 02/11/2026 (`/v2/acts/compass~crawler-google-places`):
- `allPlacesNoSearchAction: "all_places_no_search_ocr"` scrapes every place visible on the map of the area,
  with no search term (the other value, by mouse, is deprecated).
- Pay per event, FREE tier (the owner's plan): US$ 0.004 per place scraped, plus US$ 0.001 per place for
  each paid filter (category, title match, minimum stars, website, skip closed). Minimum
  `maxTotalChargeUsd` per run: US$ 0.50. The earlier constant (US$ 1.50 per 1,000) was the GOLD tier.
- There is no input to exclude places already scraped: repeating an area pays again.
- Paid filters at the source: minimum stars, with/without website, skip closed, category, exact name.
  There is no minimum-reviews filter.

## Decision
1. Nova busca: a free name (stored in `prospeccao_buscas.termo`; empty becomes "Busca em {cidade}"), where
   (UF and IBGE city), the radius (ONE value shown both in the form and on the map control) and the cap
   (50, 100, 200 or 500). No term, no category: `allPlacesNoSearchAction`. The only paid filter sent is
   `skipClosedPlaces` (the owner's call: a few cents to keep closed companies out). The run carries
   `maxTotalChargeUsd` = cap x price (never below US$ 0.50), so the source stops even if it ignores the
   place cap in the no-term mode. The footer shows the cap and the maximum cost.
2. Rating, site (with or without), reviews, unclaimed profile and CATEGORY are filters of the leads table,
   free. The category filter offers only the categories that came in the result, with counts
   (`prospeccao_categorias_do_recorte`; a lead from before 31/10 counts by its segment).
3. The map of Nova busca draws the circles of earlier searches (dashed, neutral) so the new circle goes
   outside them. Repeated places are never duplicated in the base (`prospeccao_concluir_busca` matches by
   phone or place id); only the source cost repeats.
4. A campaign shows how many leads of its list already took part in another campaign, and the owner may
   include them (`incluirJaContatados` in the campaign filter, read by `prospeccao_leads_do_filtro` and
   `prospeccao_iniciar_campanha`). Anyone who answered SAIR stays out always.
5. Spreadsheet import, Excel (.xlsx) only, inside the campaign's Contatos step: phone column found by
   header (or by content), only Brazilian mobiles enter, repeated rows dropped, and a preview BEFORE
   saving with the columns found, valid and skipped counts, how many are already in the base, how many
   asked to leave, and a sample "as in the sheet / as it will be used". Saved as a search with
   `fonte = 'planilha'` through the same SQL functions (audit row in `admin_acoes`). The project rule
   "never imported lists" got an explicit exception for the owner's own prospecting (CLAUDE.md).
6. Leads export to Excel with the filters on screen (up to 2000 rows).
7. Kept simple on purpose (owner: "não ser preciosista, só eu uso"): phone type is shown, not filtered by
   default; no "already a customer of Atenda" warning (the database does not store each company's WhatsApp
   number; only the Evolution instance name).

## Consequences
- `lib/prospeccao.ts`: `nome` in `OpcoesDaBusca`, `nomeDaBusca`, caps up to 500, FREE tier prices.
  `lib/apify-campos.ts`: `TODAS_AS_EMPRESAS`, `tetoDeGastoUsd`. `lib/planilha-de-leads.ts` (pure) and
  `lib/planilha-servidor.ts` (exceljs, server). Routes `POST /api/admin/campanhas/planilha` and
  `GET /api/admin/campanhas/leads/exportar`, both in the guard list.
- Migration `20261102184345_prospeccao_busca_ampla.sql` (functions only, backwards compatible: new
  parameters with defaults), applied before the deploy.
- Old searches keep their stored options and pills (`opcoesDoJson` reads them as they were).

## Evidence
- Search `87ed6d0c` (02/11/2026 11:56 UTC): term "testes clinicas", Mutum MG, radius 5 km, status pronta,
  0 places, closed 54 s later by the webhook.
- Actor pricing and input schema read from the public Apify API on 02/11/2026 (see Context).
