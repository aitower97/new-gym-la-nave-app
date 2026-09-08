-- Algunos socios (ej. "usuarios de sala", que no reservan clases con
-- patrón semanal fijo) no necesitan una plantilla — no es una condición
-- obligatoria para todos. El admin puede marcarlo explícitamente para que
-- ese usuario deje de contar como "pendiente" en el resumen del panel.
alter table profiles
  add column template_not_required boolean not null default false;

-- Mismo patrón que prevent_self_plan_change/prevent_self_role_change: solo
-- el admin puede tocar esta marca, nunca el propio usuario. El guard de
-- auth.uid() IS NOT NULL deja pasar las escrituras con service-role.
create or replace function prevent_self_template_flag_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (new.template_not_required is distinct from old.template_not_required)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'No autorizado para cambiar esta marca';
  end if;
  return new;
end;
$function$;

create trigger trg_prevent_self_template_flag_change
before update on profiles
for each row execute function prevent_self_template_flag_change();
