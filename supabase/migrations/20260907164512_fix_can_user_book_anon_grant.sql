-- La migración fix_self_plan_change_rls_leak de hoy hizo REVOKE ALL ... FROM
-- PUBLIC + GRANT TO authenticated, pero anon seguía pudiendo ejecutar
-- can_user_book: Supabase concede EXECUTE a anon/authenticated de forma
-- explícita (no solo vía el pseudo-rol PUBLIC) al crear una función en el
-- schema public expuesto por PostgREST — REVOKE ... FROM PUBLIC no basta,
-- hay que revocar también de anon explícitamente.
REVOKE ALL ON FUNCTION public.can_user_book(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_user_book(uuid, uuid) TO authenticated;
