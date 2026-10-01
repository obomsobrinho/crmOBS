alter table public.agent_turns
  add column if not exists cached_input_tokens integer;

comment on column public.agent_turns.cached_input_tokens is
  'Tokens de entrada servidos pelo cache de prompt da OpenAI (usage.prompt_tokens_details.cached_tokens). null = a resposta do modelo nao informou o campo; 0 = o prefixo nao bateu, e o primeiro turno de uma conversa e sempre 0. Sem esta coluna a margem real por plano e chute: input_tokens sozinho cobra tudo como se fosse entrada nova.';
