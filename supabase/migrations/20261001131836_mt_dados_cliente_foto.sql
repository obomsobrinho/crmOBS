alter table public.dados_cliente
  add column if not exists foto_path text,
  add column if not exists foto_origem text,
  add column if not exists foto_em timestamptz;
comment on column public.dados_cliente.foto_path is 'Foto de perfil copiada do WhatsApp (bucket whatsapp-media). Escrita so por service_role (lib/fotos-servidor.ts).';
comment on column public.dados_cliente.foto_origem is 'Host + caminho do link da foto no WhatsApp, sem a assinatura. Muda = foto nova.';
comment on column public.dados_cliente.foto_em is 'Ultima vez que a foto foi conferida na Evolution.';
