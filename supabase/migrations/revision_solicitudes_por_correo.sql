-- Revisión (aprobar/rechazar) de solicitudes de permiso y vacaciones por
-- correo, sin que el jefe directo (o RRHH, si no hay jefe asignado) tenga
-- que iniciar sesión en la app. Idempotente: se puede ejecutar más de una vez.
--
-- Reutiliza columnas que ya existen en solicitudes_permiso / solicitudes_vacaciones:
--   aprobado_por (uuid), fecha_resolucion (timestamptz), comentario_resolucion (text)
-- Solo se agregan las columnas del token de revisión.

-- 1) Columnas del token de revisión ------------------------------------------

alter table solicitudes_permiso
  add column if not exists revision_token uuid,
  add column if not exists revision_token_expira timestamptz,
  add column if not exists notificado_at timestamptz;

alter table solicitudes_vacaciones
  add column if not exists revision_token uuid,
  add column if not exists revision_token_expira timestamptz,
  add column if not exists notificado_at timestamptz;

create unique index if not exists solicitudes_permiso_revision_token_idx
  on solicitudes_permiso (revision_token) where revision_token is not null;

create unique index if not exists solicitudes_vacaciones_revision_token_idx
  on solicitudes_vacaciones (revision_token) where revision_token is not null;

-- 2) Lectura pública (por token) de una solicitud de permiso -----------------

create or replace function obtener_solicitud_permiso_token(p_token uuid)
returns table (
  nombre_completo text,
  rut text,
  fecha_desde date,
  fecha_hasta date,
  hora_desde time,
  hora_hasta time,
  motivo text,
  tipo_permiso text,
  estado text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      t.nombre_completo, t.rut, s.fecha_desde, s.fecha_hasta,
      s.hora_desde, s.hora_hasta, s.motivo, tp.nombre, s.estado
    from solicitudes_permiso s
    join trabajadores t on t.id = s.trabajador_id
    left join tipos_permiso tp on tp.id = s.tipo_permiso_id
    where s.revision_token = p_token
      and s.revision_token_expira > now();
end;
$$;

-- 3) Aprobar/rechazar una solicitud de permiso por token ---------------------

create or replace function resolver_solicitud_permiso(p_token uuid, p_accion text)
returns table (ok boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_permiso%rowtype;
begin
  if p_accion not in ('aprobada', 'rechazada') then
    return query select false, 'Acción inválida.';
    return;
  end if;

  select * into v_solicitud
    from solicitudes_permiso
    where revision_token = p_token
      and revision_token_expira > now()
    for update;

  if not found then
    return query select false, 'Este enlace ya no es válido o expiró.';
    return;
  end if;

  if v_solicitud.estado <> 'pendiente' then
    return query select false, 'Esta solicitud ya fue revisada anteriormente.';
    return;
  end if;

  -- aprobado_por ya quedó registrado (el jefe o RRHH) cuando se generó el
  -- token de revisión, en generar_token_revision_permiso.
  update solicitudes_permiso
    set estado = p_accion,
        fecha_resolucion = now(),
        comentario_resolucion = case
          when p_accion = 'rechazada' then 'Favor dirigirse personalmente con su jefatura.'
          else null
        end,
        revision_token = null,
        revision_token_expira = null
    where id = v_solicitud.id;

  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  values (
    v_solicitud.trabajador_id,
    'Solicitud de permiso',
    case
      when p_accion = 'aprobada' then 'Tu solicitud de permiso fue aprobada.'
      else 'Tu solicitud de permiso no fue autorizada. Favor dirigirse personalmente con su jefatura.'
    end,
    'solicitud_permiso',
    v_solicitud.id
  );

  return query select true, 'Listo, quedó registrado.';
end;
$$;

-- 4) Lo mismo para vacaciones -------------------------------------------------

create or replace function obtener_solicitud_vacaciones_token(p_token uuid)
returns table (
  nombre_completo text,
  rut text,
  fecha_desde date,
  fecha_hasta date,
  dias_habiles numeric,
  estado text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      t.nombre_completo, t.rut, s.fecha_desde, s.fecha_hasta,
      s.dias_habiles, s.estado
    from solicitudes_vacaciones s
    join trabajadores t on t.id = s.trabajador_id
    where s.revision_token = p_token
      and s.revision_token_expira > now();
end;
$$;

create or replace function resolver_solicitud_vacaciones(p_token uuid, p_accion text)
returns table (ok boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_vacaciones%rowtype;
begin
  if p_accion not in ('aprobada', 'rechazada') then
    return query select false, 'Acción inválida.';
    return;
  end if;

  select * into v_solicitud
    from solicitudes_vacaciones
    where revision_token = p_token
      and revision_token_expira > now()
    for update;

  if not found then
    return query select false, 'Este enlace ya no es válido o expiró.';
    return;
  end if;

  if v_solicitud.estado <> 'pendiente' then
    return query select false, 'Esta solicitud ya fue revisada anteriormente.';
    return;
  end if;

  update solicitudes_vacaciones
    set estado = p_accion,
        fecha_resolucion = now(),
        comentario_resolucion = case
          when p_accion = 'rechazada' then 'Favor dirigirse personalmente con su jefatura.'
          else null
        end,
        revision_token = null,
        revision_token_expira = null
    where id = v_solicitud.id;

  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  values (
    v_solicitud.trabajador_id,
    'Solicitud de vacaciones',
    case
      when p_accion = 'aprobada' then 'Tu solicitud de vacaciones fue aprobada.'
      else 'Tu solicitud de vacaciones no fue autorizada. Favor dirigirse personalmente con su jefatura.'
    end,
    'solicitud_vacaciones',
    v_solicitud.id
  );

  return query select true, 'Listo, quedó registrado.';
end;
$$;

-- 5) Generar el token de revisión (solo la Edge Function, con service role,
--    la ejecuta — por eso no se le da permiso a anon/authenticated). Guarda
--    también quién debe revisarla (jefe directo o RRHH) en aprobado_por como
--    referencia previa a la resolución. ----------------------------------

create or replace function generar_token_revision_permiso(p_solicitud_id uuid, p_revisor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update solicitudes_permiso
    set revision_token = v_token,
        revision_token_expira = now() + interval '7 days',
        aprobado_por = p_revisor_id,
        notificado_at = now()
    where id = p_solicitud_id;
  return v_token;
end;
$$;

create or replace function generar_token_revision_vacaciones(p_solicitud_id uuid, p_revisor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update solicitudes_vacaciones
    set revision_token = v_token,
        revision_token_expira = now() + interval '7 days',
        aprobado_por = p_revisor_id,
        notificado_at = now()
    where id = p_solicitud_id;
  return v_token;
end;
$$;

-- 6) Permisos: las funciones de lectura/decisión por token deben poder
--    ejecutarse sin sesión (rol anon), ya que el jefe entra desde el correo
--    sin iniciar sesión. Las de generar token solo las usa la Edge Function
--    con la service role, así que no se las damos a anon/authenticated.

revoke all on function obtener_solicitud_permiso_token(uuid) from public;
grant execute on function obtener_solicitud_permiso_token(uuid) to anon, authenticated;

revoke all on function resolver_solicitud_permiso(uuid, text) from public;
grant execute on function resolver_solicitud_permiso(uuid, text) to anon, authenticated;

revoke all on function obtener_solicitud_vacaciones_token(uuid) from public;
grant execute on function obtener_solicitud_vacaciones_token(uuid) to anon, authenticated;

revoke all on function resolver_solicitud_vacaciones(uuid, text) from public;
grant execute on function resolver_solicitud_vacaciones(uuid, text) to anon, authenticated;

revoke all on function generar_token_revision_permiso(uuid, uuid) from public, anon, authenticated;
revoke all on function generar_token_revision_vacaciones(uuid, uuid) from public, anon, authenticated;

-- La Edge Function llama a estas dos funciones con la service role (la
-- Edge Function corre con permisos totales de servicio, pero dejamos el
-- grant explícito para que no dependa de eso).
grant execute on function generar_token_revision_permiso(uuid, uuid) to service_role;
grant execute on function generar_token_revision_vacaciones(uuid, uuid) to service_role;
