-- =========================================================
-- Doble aprobación para VACACIONES (no aplica a permisos): si el
-- trabajador tiene un jefe directo válido (con rol jefatura/rrhh/
-- administrador), la solicitud primero la aprueba o rechaza ese jefe;
-- si aprueba, pasa a un estado intermedio 'aprobada_jefe' a la espera
-- de una segunda firma de RR.HH./administrador, que recién ahí la deja
-- 'aprobada' (final) o 'rechazada'.
--
-- Si el trabajador NO tiene jefe directo válido, sigue como antes: una
-- sola etapa, RR.HH. resuelve directo (estado pasa de 'pendiente' a
-- 'aprobada'/'rechazada' sin pasar por 'aprobada_jefe').
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo
-- (salvo el ALTER TYPE, que ya es idempotente con IF NOT EXISTS).
-- =========================================================

-- 1) Nuevo valor de estado ---------------------------------------------------
-- El enum estado_solicitud es compartido con solicitudes_permiso, pero
-- permisos nunca va a usar este valor nuevo (la doble aprobación es solo
-- para vacaciones).
alter type estado_solicitud add value if not exists 'aprobada_jefe';

-- 2) Columnas para registrar la primera firma (la del jefe directo) ---------
-- aprobado_por / fecha_resolucion / comentario_resolucion (que ya existían)
-- pasan a representar siempre la DECISIÓN FINAL: la de RR.HH. cuando hay
-- doble aprobación, o la única decisión cuando el trabajador no tiene jefe
-- directo válido, o el rechazo del jefe cuando rechaza en la primera etapa
-- (ahí también termina el flujo, sin pasar por RR.HH.).
alter table solicitudes_vacaciones
  add column if not exists aprobado_por_jefe uuid references trabajadores(id) on delete set null,
  add column if not exists fecha_aprobacion_jefe timestamptz;

-- 3) Ajuste de resolver_solicitud_vacaciones (revisión por correo, sin login)
-- ---------------------------------------------------------------------------
-- Antes, aprobar por este camino dejaba la solicitud directo en 'aprobada'.
-- Ahora hay que distinguir: si el trabajador tiene jefe directo válido, el
-- enlace por correo solo se le manda a ÉL (ver Edge Function
-- notificar-revision, que ya prioriza al jefe y solo cae a RR.HH. si no hay
-- uno con acceso) — así que un "aprobada" ahí es la PRIMERA firma, y debe
-- dejar la solicitud en 'aprobada_jefe', a la espera de RR.HH. dentro de la
-- app (la segunda firma no se ofrece por correo). Si el trabajador no tiene
-- jefe directo válido, el enlace se le manda a RR.HH. y "aprobada" sigue
-- siendo la aprobación única de siempre, sin pasar por 'aprobada_jefe'.
--
-- El rechazo no cambia: en cualquiera de los dos casos termina el flujo
-- ahí mismo, tal como ya funcionaba (aprobado_por ya queda registrado al
-- generar el token, con quien corresponda revisar).
create or replace function resolver_solicitud_vacaciones(p_token uuid, p_accion text)
returns table (ok boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_vacaciones%rowtype;
  v_trabajador trabajadores%rowtype;
  v_tiene_jefe_valido boolean;
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

  if p_accion = 'rechazada' then
    update solicitudes_vacaciones
      set estado = 'rechazada',
          fecha_resolucion = now(),
          comentario_resolucion = 'Favor dirigirse personalmente con su jefatura.',
          revision_token = null,
          revision_token_expira = null
      where id = v_solicitud.id;

    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_solicitud.trabajador_id,
      'Solicitud de vacaciones',
      'Tu solicitud de vacaciones no fue autorizada. Favor dirigirse personalmente con su jefatura.',
      'solicitud_vacaciones',
      v_solicitud.id
    );

    return query select true, 'Listo, quedó registrado.';
    return;
  end if;

  -- p_accion = 'aprobada': hay que distinguir si esto es la firma del jefe
  -- directo (primera etapa, si el trabajador tiene uno válido) o la
  -- aprobación única (si no tiene jefe directo con acceso al sistema).
  select * into v_trabajador from trabajadores where id = v_solicitud.trabajador_id;
  v_tiene_jefe_valido := v_trabajador.jefe_directo_id is not null and exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = v_trabajador.jefe_directo_id
      and tr.rol in ('jefatura', 'rrhh', 'administrador')
  );

  if v_tiene_jefe_valido then
    -- aprobado_por_jefe = aprobado_por: toma el valor que ya tenía la fila
    -- ANTES de este update (el revisor que se guardó al generar el token,
    -- que en este caso es el jefe directo), y lo traslada a la columna de
    -- la primera firma. aprobado_por queda en null porque todavía no hay
    -- decisión final.
    update solicitudes_vacaciones
      set estado = 'aprobada_jefe',
          aprobado_por_jefe = aprobado_por,
          fecha_aprobacion_jefe = now(),
          aprobado_por = null,
          revision_token = null,
          revision_token_expira = null
      where id = v_solicitud.id;

    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_solicitud.trabajador_id,
      'Solicitud de vacaciones',
      'Tu jefe directo aprobó tu solicitud de vacaciones. Ahora está a la espera de la firma de RR.HH.',
      'solicitud_vacaciones',
      v_solicitud.id
    );
  else
    update solicitudes_vacaciones
      set estado = 'aprobada',
          fecha_resolucion = now(),
          revision_token = null,
          revision_token_expira = null
      where id = v_solicitud.id;

    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_solicitud.trabajador_id,
      'Solicitud de vacaciones',
      'Tu solicitud de vacaciones fue aprobada.',
      'solicitud_vacaciones',
      v_solicitud.id
    );
  end if;

  return query select true, 'Listo, quedó registrado.';
end;
$$;
