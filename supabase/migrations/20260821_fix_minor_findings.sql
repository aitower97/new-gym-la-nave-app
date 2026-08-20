-- Auditoría pre-producción — hallazgos MENORES 1, 2 y 3.

-- MENOR 1: si se borra un admin que había marcado pagos, la FK sin
-- ON DELETE bloqueaba el DELETE de su fila en profiles; delete-user solo
-- logueaba el error y seguía adelante borrándolo de auth.users, dejando el
-- profile huérfano (derecho al olvido incompleto). Con SET NULL, el borrado
-- de profiles ya no queda bloqueado y el registro de quién marcó el pago
-- simplemente queda en blanco si esa persona ya no existe.
ALTER TABLE public.plan_payments
  DROP CONSTRAINT plan_payments_marked_by_fkey,
  ADD CONSTRAINT plan_payments_marked_by_fkey
    FOREIGN KEY (marked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- MENOR 2: handle_new_user() es SECURITY DEFINER sin search_path fijado
-- (mismo patrón de hardening ya aplicado a is_admin() en
-- 20260707_security_hardening.sql). En la práctica no es explotable hoy
-- (depende de la variable NEW del trigger, falla si se invoca por RPC
-- directo) pero se cierra por higiene y consistencia.
ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- MENOR 3 (pg_net en schema public): NO se toca — la extensión no soporta
-- SET SCHEMA en esta versión (no es relocalizable). Es puramente cosmético:
-- sus funciones ya viven en el schema net.* con o sin este cambio, así que
-- se deja como está en vez de forzar un workaround arriesgado.
