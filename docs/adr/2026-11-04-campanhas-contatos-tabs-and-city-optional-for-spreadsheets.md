# Campanhas: the Contatos step chooses its source in two tabs, starts empty, and a spreadsheet list may have no city
- Date: 2026-11-04
- Status: Accepted (design approved by the owner on 04/11/2026 00:40, published the same night)
- Area: admin, product

## Context
On 03/11/2026 the owner imported `contatos_franck_maria_jullia.xlsx` (columns Telefone and Nome, no
Cidade). The preview parsed it, but "Importar 2" answered "Não deu para importar agora". Postgres log,
2026-11-04 00:20:13 UTC: `new row for relation "prospeccao_buscas" violates check constraint
"prospeccao_buscas_cidade_check"`. `gravarPlanilha` passes the most frequent city of the sheet, which is
"" without a Cidade column, and the table required a non empty city for every search. Nothing was
written (one transaction).

The step itself also hid the spreadsheet behind a link and a modal, and the source select opened on
"Todas as buscas", so a new campaign showed a lead count before the owner chose anything.

## Decision
- Migration `20261104040309_prospeccao_planilha_sem_cidade.sql`: `prospeccao_buscas_cidade_check`
  becomes `check (fonte = 'planilha' or btrim(cidade) <> '')`. A Google search still needs a city.
- The Contatos step asks "De onde vêm os contatos?" with two tabs (`Tabs` `painel`): "Lista de leads"
  (open by default: the source select, the Recorte and the new search link) and "Importar planilha"
  (inline, no modal: the accepted format, a header only template at `/modelos/modelo-contatos.xlsx`,
  the file picker, the existing preview and the confirm). On success the tab switches back to the list
  with the new list selected.
- A new campaign starts with no source: `FiltroDeContatos.buscaId = ""`. `temListaEscolhida`
  (`lib/prospeccao.ts`) is the rule: with nothing chosen "Quem entra" shows no count, the step does
  not advance, `previaDoFiltro` answers zero without the database, and `problemasParaIniciar` refuses
  on the server before the SQL (which would fail casting "" to uuid). "Todas as listas" stays as an
  explicit option, never preselected: old drafts and the "quem não respondeu" flow store `"todas"`.
- A list without city never shows a dangling separator: labels join only the parts that exist.

## Consequences
- A spreadsheet with only a phone column imports. The template has no example rows on purpose, so no
  sample number can become a lead.
- Old drafts keep their stored source; drafts saved with `"todas"` still show it.
