-- ============================================================
-- Registro de LOGIN en auditoria (no cambia la estructura)
-- Seguro de ejecutar varias veces.
-- ============================================================

alter table public.auditoria enable row level security;

drop policy if exists auditoria_insert_propio on public.auditoria;
create policy auditoria_insert_propio
  on public.auditoria
  for insert
  to authenticated
  with check (trabajador_id = auth.uid() and accion = 'LOGIN');

revoke all on public.auditoria from anon;
revoke select, update, delete on public.auditoria from authenticated;
grant insert on public.auditoria to authenticated;

create or replace function public.registrar_login(p_dispositivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  if exists (
    select 1 from public.auditoria
    where trabajador_id = v_uid
      and accion = 'LOGIN'
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into public.auditoria (trabajador_id, accion, tabla_afectada, registro_id, detalle)
  values (
    v_uid,
    'LOGIN',
    'sesion',
    null,
    case
      when p_dispositivo in ('movil', 'escritorio')
        then jsonb_build_object('origen', 'web', 'dispositivo', p_dispositivo)
      else jsonb_build_object('origen', 'web')
    end
  );
exception when others then
  null;
end;
$$;

revoke all on function public.registrar_login(text) from public, anon;
grant execute on function public.registrar_login(text) to authenticated;
