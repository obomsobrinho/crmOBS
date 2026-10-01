-- R-53, decisao do dono (2026-10-01): so o AUTOR da nota ou um DONO do tenant
-- pode editar ou apagar uma nota interna. Qualquer membro continua lendo e
-- criando.
--
-- ANTES: uma policy FOR ALL (conv_notes_all). USING so checava o tenant, e o
-- WITH CHECK (autor = eu) so vale para linha nova ou alterada, entao DELETE de
-- nota de colega passava: qualquer atendente apagava nota do dono.
--
-- DEPOIS: quatro policies. O estilo `(select auth.uid())` da casa foi mantido
-- (avaliado uma vez por consulta). A leitura segue pela conversa do tenant, o
-- que tambem e o que o realtime de conversation_notes precisa para avaliar
-- cada evento.
--
-- No UPDATE o WITH CHECK nao pode exigir autor = eu (o dono edita nota alheia),
-- entao ele so confirma que a linha continua numa conversa do tenant. O app so
-- cria e apaga notas; editar nao existe na tela hoje.

drop policy if exists conv_notes_all on public.conversation_notes;
drop policy if exists conv_notes_select on public.conversation_notes;
drop policy if exists conv_notes_insert on public.conversation_notes;
drop policy if exists conv_notes_update on public.conversation_notes;
drop policy if exists conv_notes_delete on public.conversation_notes;

create policy conv_notes_select on public.conversation_notes
  for select to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (
        select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())
      )
    )
  );

create policy conv_notes_insert on public.conversation_notes
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (
        select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())
      )
    )
  );

create policy conv_notes_update on public.conversation_notes
  for update to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (
        select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())
      )
    )
    and (
      author_user_id = (select auth.uid())
      or client_id in (
        select uc.client_id from public.user_clients uc
        where uc.user_id = (select auth.uid()) and uc.role = 'dono'
      )
    )
  )
  with check (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (
        select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())
      )
    )
  );

create policy conv_notes_delete on public.conversation_notes
  for delete to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (
        select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())
      )
    )
    and (
      author_user_id = (select auth.uid())
      or client_id in (
        select uc.client_id from public.user_clients uc
        where uc.user_id = (select auth.uid()) and uc.role = 'dono'
      )
    )
  );
