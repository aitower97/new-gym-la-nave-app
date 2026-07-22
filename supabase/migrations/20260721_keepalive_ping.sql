-- Tabla dummy usada solo por el cron externo de keep-alive (GitHub Actions)
-- para evitar que Supabase pause el proyecto por inactividad (free tier:
-- pausa a los 7 días sin actividad de API). El workflow inserta y borra una
-- fila vacía cada día; no almacena datos reales de la app.

create table if not exists public.keepalive_ping (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.keepalive_ping enable row level security;

-- Sin políticas: anon/authenticated no pueden leer ni escribir esta tabla.
-- Solo el cron (con la service_role key) puede, porque service_role
-- bypassa RLS. Así no se abre ninguna superficie nueva a los usuarios.
