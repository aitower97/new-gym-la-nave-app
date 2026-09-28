-- Postgres da EXECUTE a PUBLIC al crear una función; con SECURITY DEFINER eso
-- las expone por /rest/v1/rpc a cualquiera, anónimos incluidos.

-- Funciones de trigger: nadie las llama directamente.
REVOKE EXECUTE ON FUNCTION public.log_booking_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_class_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_waitlist_on_booking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_demo_flag_change() FROM PUBLIC, anon, authenticated;

-- Funciones que la app llama con sesión iniciada: fuera los anónimos.
REVOKE EXECUTE ON FUNCTION public.max_classes_per_day() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.max_classes_per_day() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_join_waitlist(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_join_waitlist(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.quota_period_start(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quota_period_start(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.waitlist_position(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.waitlist_position(uuid) TO authenticated;
