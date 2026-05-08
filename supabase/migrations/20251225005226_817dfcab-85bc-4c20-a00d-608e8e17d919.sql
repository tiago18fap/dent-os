-- Bucket privado para armazenar arquivos de importação
insert into storage.buckets (id, name, public)
values ('importacoes', 'importacoes', false)
on conflict (id) do nothing;

-- Tabela de histórico de importações
create table if not exists public.importacoes_historico (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null,
  mes_referencia text,
  origem text,
  file_path text not null,
  file_name text not null,
  status text not null default 'enviado',
  n8n_status text,
  n8n_response jsonb
);