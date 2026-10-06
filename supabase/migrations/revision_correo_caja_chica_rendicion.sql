-- Revisión (aprobar/rechazar) de solicitudes de caja chica y rendiciones de
-- gastos por correo, sin que el revisor tenga que iniciar sesión en la app.
-- Sigue el mismo patrón de revision_solicitudes_por_correo.sql (permisos y
-- vacaciones). Idempotente: se puede ejecutar más de una vez.
--
-- Para rendición de gastos, que tiene doble aprobación (jefe → Finanzas),
-- se guardan tokens por etapa. Cuando el jefe aprueba desde el correo, el
-- servidor genera un nuevo token para Finanzas.

-- ===========================================================================
-- 1) CAJA CHICA — Columnas del token
-- ===========================================================================

alter table caja_chica_solicitudes
  add column if not exists revision_token uuid,
  add column if not exists revision_token_expira timestamptz,
  add column if not exists notificado_at timestamptz;

create unique index if not exists caja_chica_solicitudes_revision_token_idx
  on caja_chica_solicitudes (revision_token) where revision_token is not null;

-- ===========================================================================
-- 2) CAJA CHICA — Leer solicitud por token (para la página de revisión)
-- ===========================================================================

create or replace function obtener_solicitud_caja_chica_token(p_token uuid)
returns table (
  id uuid,
  nombre_completo text,
  rut text,
  monto_solicitado numeric,
  articulo text,
  razon text,
  estado text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      s.id, t.nombre_completo, t.rut,
      s.monto_solicitado, s.articulo, s.razon,
      s.estado, s.created_at
    from caja_chica_solicitudes s
    join trabajadores t on t.id = s.solicitante_id
    where s.revision_token = p_token
      and s.revision_token_expira > now();
end;
$$;

-- ===========================================================================
-- 3) CAJA CHICA — Generar token de revisión (solo service_role)
-- ===========================================================================

create or replace function generar_token_revision_caja_chica(p_solicitud_id uuid, p_revisor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update caja_chica_solicitudes
    set revision_token = v_token,
        revision_token_expira = now() + interval '7 days',
        notificado_at = now()
    where id = p_solicitud_id;
  return v_token;
end;
$$;

-- ===========================================================================
-- 4) RENDICIÓN DE GASTOS — Columnas del token
-- ===========================================================================

alter table rendiciones_gastos
  add column if not exists revision_token uuid,
  add column if not exists revision_token_expira timestamptz,
  add column if not exists revision_etapa text check (revision_etapa in ('jefe', 'finanzas')),
  add column if not exists notificado_at timestamptz;

create unique index if not exists rendiciones_gastos_revision_token_idx
  on rendiciones_gastos (revision_token) where revision_token is not null;

-- ===========================================================================
-- 5) RENDICIÓN DE GASTOS — Leer rendición por token
-- ===========================================================================

create or replace function obtener_rendicion_gastos_token(p_token uuid)
returns table (
  id uuid,
  nombre_completo text,
  rut text,
  moneda text,
  total_entregado_qdc numeric,
  estado text,
  revision_etapa text,
  fecha_envio timestamptz,
  total_lineas numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      r.id, t.nombre_completo, t.rut,
      r.moneda, r.total_entregado_qdc,
      r.estado, r.revision_etapa, r.fecha_envio,
      coalesce(sum(l.monto), 0) as total_lineas
    from rendiciones_gastos r
    join trabajadores t on t.id = r.trabajador_id
    left join rendicion_gastos_lineas l on l.rendicion_id = r.id
    where r.revision_token = p_token
      and r.revision_token_expira > now()
    group by r.id, t.nombre_completo, t.rut,
      r.moneda, r.total_entregado_qdc,
      r.estado, r.revision_etapa, r.fecha_envio;
end;
$$;

-- ===========================================================================
-- 6) RENDICIÓN DE GASTOS — Generar token de revisión (solo service_role)
-- ===========================================================================

create or replace function generar_token_revision_rendicion_gastos(
  p_rendicion_id uuid,
  p_revisor_id uuid,
  p_etapa text  -- 'jefe' o 'finanzas'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update rendiciones_gastos
    set revision_token = v_token,
        revision_token_expira = now() + interval '7 days',
        revision_etapa = p_etapa,
        notificado_at = now()
    where id = p_rendicion_id;
  return v_token;
end;
$$;

-- ===========================================================================
-- 7) Permisos
-- ===========================================================================

-- Lectura por token: anon + authenticated (el revisor no está logueado)
revoke all on function obtener_solicitud_caja_chica_token(uuid) from public;
grant execute on function obtener_solicitud_caja_chica_token(uuid) to anon, authenticated;

revoke all on function obtener_rendicion_gastos_token(uuid) from public;
grant execute on function obtener_rendicion_gastos_token(uuid) to anon, authenticated;

-- Generación de tokens: solo service_role (la llaman las API routes del servidor)
revoke all on function generar_token_revision_caja_chica(uuid, uuid) from public, anon, authenticated;
grant execute on function generar_token_revision_caja_chica(uuid, uuid) to service_role;

revoke all on function generar_token_revision_rendicion_gastos(uuid, uuid, text) from public, anon, authenticated;
grant execute on function generar_token_revision_rendicion_gastos(uuid, uuid, text) to service_role;
