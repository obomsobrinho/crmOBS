-- Campanhas: a lista vinda de uma planilha pode não ter cidade (decisão do dono de 04/11/2026). A
-- planilha só exige a coluna do telefone, e a importação de uma planilha sem a coluna Cidade era recusada
-- pelo banco (prospeccao_buscas_cidade_check, cidade vazia), com "Não deu para importar agora" na tela.
-- A busca do Google continua exigindo cidade; só a fonte 'planilha' aceita cidade vazia.
-- Sem coluna nova, sem dado mexido: só a regra da tabela. prospeccao_criar_busca grava o que recebe e
-- não muda.
alter table public.prospeccao_buscas drop constraint if exists prospeccao_buscas_cidade_check;
alter table public.prospeccao_buscas
  add constraint prospeccao_buscas_cidade_check check (fonte = 'planilha' or btrim(cidade) <> '');
