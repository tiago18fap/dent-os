-- Drop old single-tenant policies
DROP POLICY IF EXISTS "Usuário vê seu próprio WhatsApp" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Usuário insere seu próprio WhatsApp" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Usuário atualiza seu próprio WhatsApp" ON public.whatsapp_config;

-- Create Super Admin policy
CREATE POLICY "Super admins gerenciam whatsapp_config" ON public.whatsapp_config
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = ANY (ARRAY['tiago@dentos.com.br'::text, 'admin@dentos.com.br'::text, 'tiago18fap@gmail.com'::text, 'contato@dentos.com.br'::text, 'victorpconti@gmail.com'::text]))
  WITH CHECK ((auth.jwt() ->> 'email'::text) = ANY (ARRAY['tiago@dentos.com.br'::text, 'admin@dentos.com.br'::text, 'tiago18fap@gmail.com'::text, 'contato@dentos.com.br'::text, 'victorpconti@gmail.com'::text]));

-- Create Tenant Isolation policy
CREATE POLICY "Tenant Isolation whatsapp_config" ON public.whatsapp_config
  FOR ALL
  TO authenticated
  USING (clinica_id = get_user_clinica_id())
  WITH CHECK (clinica_id = get_user_clinica_id());
