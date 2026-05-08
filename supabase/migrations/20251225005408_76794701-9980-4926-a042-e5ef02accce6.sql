-- Bloquear acesso direto via API; apenas service role (que ignora RLS) acessará
create policy "Nenhum acesso direto" on public.importacoes_historico
for all
to public
using (false)
with check (false);