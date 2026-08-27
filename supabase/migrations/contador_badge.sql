-- =========================================================
-- Contador total para el "badge" del ícono de la app.
-- Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Suma notificaciones sin leer + mensajes sin leer (respetando
-- conversaciones que la persona ocultó, igual que hace la pantalla de
-- Mensajes) de un trabajador. La usan los endpoints de push
-- (/api/push/enviar y /api/push/enviar-mensaje) para saber qué número
-- mandarle al service worker.
--
-- security definer: corre con privilegios del dueño (bypasea RLS) para
-- poder sumar sobre cualquier trabajador_id que le pasen — por eso el
-- execute NO se le da a "authenticated" ni "anon", solo al rol de
-- servicio que usan esos endpoints (con la service role key ya se
-- puede llamar sin necesidad de este grant, pero se deja explícito).
-- =========================================================

create or replace function fn_contador_badge(p_trabajador_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((
      select count(*) from notificaciones
      where trabajador_id = p_trabajador_id and leida = false
    ), 0)::integer
    +
    coalesce((
      select sum(no_leidos) from (
        select (
          select count(*) from mensajes m
          where m.conversacion_id = cp.conversacion_id
            and m.trabajador_id <> cp.trabajador_id
            and m.creado_en > coalesce(cp.ultima_lectura, 'epoch'::timestamptz)
        ) as no_leidos
        from conversaciones_participantes cp
        where cp.trabajador_id = p_trabajador_id
          and (
            cp.oculta_desde is null
            or exists (
              select 1 from mensajes m4
              where m4.conversacion_id = cp.conversacion_id and m4.creado_en > cp.oculta_desde
            )
          )
      ) t
    ), 0)::integer;
$$;

revoke all on function fn_contador_badge(uuid) from public;
grant execute on function fn_contador_badge(uuid) to service_role;
