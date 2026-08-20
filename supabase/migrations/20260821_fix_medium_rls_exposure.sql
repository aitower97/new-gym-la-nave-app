-- Auditoría pre-producción — hallazgos MEDIOS 3 y 4: políticas legacy de
-- lectura abierta que convivían con las correctas (auth.uid()=user_id /
-- is_admin()), permitiendo a cualquier usuario autenticado listar quién es
-- admin (user_roles) y ver el listado completo de reservas de todos los
-- usuarios (bookings), no solo las suyas.

DROP POLICY IF EXISTS "Allow authenticated read" ON public.user_roles;
DROP POLICY IF EXISTS "Usuarios pueden ver todas las reservas" ON public.bookings;
