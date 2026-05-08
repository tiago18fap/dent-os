-- Garante que novos usuários recebam papel padrão "user" e perfil criado/atualizado
-- Reutiliza a função public.handle_new_user já existente

-- Remove trigger anterior se existir, para evitar duplicidade
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Cria trigger que dispara sempre que um novo usuário é criado em auth.users
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();