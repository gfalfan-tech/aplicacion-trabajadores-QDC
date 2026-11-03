-- =========================================================
-- Doble aprobación para PERMISOS (igual que vacaciones): si el trabajador
-- tiene un jefe directo válido (con rol jefatura/rrhh/administrador), el
-- permiso primero lo aprueba o rechaza ese jefe; si aprueba, queda en el
-- estado intermedio 'aprobada_jefe' a la espera de la firma de RR.HH./
-- administrador, que recién ahí lo deja 'aprobada' (final) o 'rechazada'.
-- RR.HH. solo ve los permisos pendientes cuando el jefe ya los aprobó.
--
-- Si el trabajador NO tiene jefe directo válido, sigue una sola etapa:
-- RR.HH. resuelve directo ('pendiente' -> 'aprobada'/'rechazada').
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar.
-- (El valor 'aprobada_jefe' del enum estado_solicitud ya existe, lo creó
-- doble_aprobacion_vacaciones.sql.)
-- =========================================================

-- 1) Columnas para registrar la primera firma (la del jefe directo) ---------
alter table solicitudes_permiso
  add column if not exists aprobado_por_jefe uuid references trabajadores(id) on delete set null,
  add column if not exists fecha_aprobacion_jefe timestamptz;

-- 2) El beneficio de cumpleaños (uno por año) debe seguir bloqueando
--    duplicados mientras el permiso espera la firma de RR.HH. ---------------
drop index if exists ux_cumpleanos_uno_por_anio;
create unique index if not exists ux_cumpleanos_uno_por_anio
  on solicitudes_permiso (trabajador_id, anio_beneficio)
  where anio_beneficio is not null and estado in ('pendiente', 'aprobada_jefe', 'aprobada');

-- 3) Revisión por enlace de correo (sin login) --------------------------------
-- Con jefe directo válido, el enlace va al jefe: "aprobada" ahí es la
-- PRIMERA firma y deja el permiso en 'aprobada_jefe' (la segunda firma se
-- hace dentro de la app). Sin jefe válido, el enlace va a RR.HH. y
-- "aprobada" es la aprobación única. El rechazo termina el flujo en
-- cualquiera de los dos casos.
create or replace function resolver_solicitud_permiso(p_token uuid, p_accion text)
returns table (ok boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_permiso%rowtype;
  v_trabajador trabajadores%rowtype;
  v_tiene_jefe_valido boolean;
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

  if p_accion = 'rechazada' then
    update solicitudes_permiso
      set estado = 'rechazada',
          fecha_resolucion = now(),
          comentario_resolucion = 'Favor dirigirse personalmente con su jefatura.',
          revision_token = null,
          revision_token_expira = null
      where id = v_solicitud.id;

    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_solicitud.trabajador_id,
      'Solicitud de permiso',
      'Tu solicitud de permiso no fue autorizada. Favor dirigirse personalmente con su jefatura.',
      'solicitud_permiso',
      v_solicitud.id
    );

    return query select true, 'Listo, quedó registrado.';
    return;
  end if;

  select * into v_trabajador from trabajadores where id = v_solicitud.trabajador_id;
  v_tiene_jefe_valido := v_trabajador.jefe_directo_id is not null and exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = v_trabajador.jefe_directo_id
      and tr.rol in ('jefatura', 'rrhh', 'administrador')
  );

  if v_tiene_jefe_valido then
    -- aprobado_por (guardado al generar el token) era el jefe revisor: pasa
    -- a la columna de la primera firma. aprobado_por queda en null hasta que
    -- RR.HH. dé la decisión final.
    update solicitudes_permiso
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
      'Solicitud de permiso',
      'Tu jefe directo aprobó tu solicitud de permiso. Ahora está a la espera de la firma de RR.HH.',
      'solicitud_permiso',
      v_solicitud.id
    );
  else
    update solicitudes_permiso
      set estado = 'aprobada',
          fecha_resolucion = now(),
          comentario_resolucion = null,
          revision_token = null,
          revision_token_expira = null
      where id = v_solicitud.id;

    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_solicitud.trabajador_id,
      'Solicitud de permiso',
      'Tu solicitud de permiso fue aprobada.',
      'solicitud_permiso',
      v_solicitud.id
    );
  end if;

  return query select true, 'Listo, quedó registrado.';
end;
$$;
