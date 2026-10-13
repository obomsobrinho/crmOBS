-- PEDIDOS_PAGINA COM PLANO POR CHAMADA (revisao de 13/10/2026).
--
-- POR QUE: a regra de .claude/rules/data.md (List RPCs) pede
-- plan_cache_mode = force_custom_plan em toda funcao de lista com parametros
-- opcionais (p_x is null or ...). pedidos_pagina nunca teve: com o plano
-- generico em cache, o Postgres pode escolher o mesmo plano para a aba de
-- abertos, a de resolvidos, a busca e o filtro de motivo, e perder os indices
-- parciais de cada um. So muda a configuracao da funcao: corpo, retorno e
-- privilegios ficam como em 20261009005834_pedido_atualizado.sql.

alter function public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int, text)
  set plan_cache_mode = force_custom_plan;
