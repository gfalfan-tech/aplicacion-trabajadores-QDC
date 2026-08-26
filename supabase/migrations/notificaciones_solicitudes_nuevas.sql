-- =========================================================
-- Notificaciones automáticas cuando se CREA una solicitud (no cuando se
-- resuelve, eso ya existía). Hasta ahora, al pedir un permiso, vacaciones o
-- certificado de antigüedad, solo se enviaba un correo (permiso/vacaciones)
-- o no se avisaba a nadie (certificado) — quien debía aprobar no se
-- enteraba dentro de la app ni por push.
--
-- Reutiliza la tabla "notificaciones" que ya dispara el push (vía el
-- webhook configurado en Supabase → Database Webhooks).
--
-- Reglas:
--   - Permiso / Vacaciones: notifica al jefe directo (si tiene acceso al
--     menos a jefatura/RR.HH./administrador) Y SIEMPRE a todo RR.HH./
--     administrador (para que puedan hacer seguimiento aunque exista jefe).
--   - Certificado de antigüedad: notifica a todo RR.HH./administrador.
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

-- 1) Permiso -------------------------------------------------------------

create or replace function notificar_nueva_solicitud_permiso() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabajador trabajadores%rowtype;
begin
  select * into v_trabajador from trabajadores where id = new.trabajador_id;

  if v_trabajador.jefe_directo_id is not null and exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = v_trabajador.jefe_directo_id
      and tr.rol in ('jefatura', 'rrhh', 'administrador')
  ) then
    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_trabajador.jefe_directo_id,
      'Nueva solicitud de permiso',
      coalesce(v_trabajador.nombre_completo, 'Un trabajador') || ' solicitó un permiso. Debes revisarla.',
      'solicitud_permiso_revision',
      new.id
    );
  end if;

  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  select distinct tr.trabajador_id,
    'Nueva solicitud de permiso',
    coalesce(v_trabajador.nombre_completo, 'Un trabajador') || ' solicitó un permiso.',
    'solicitud_permiso_revision',
    new.id
  from trabajador_roles tr
  where tr.rol in ('rrhh', 'administrador')
    and tr.trabajador_id is distinct from v_trabajador.jefe_directo_id;

  return new;
end;
$$;

drop trigger if exists trg_notificar_nueva_solicitud_permiso on solicitudes_permiso;
create trigger trg_notificar_nueva_solicitud_permiso
  after insert on solicitudes_permiso
  for each row execute function notificar_nueva_solicitud_permiso();

-- 2) Vacaciones ------------------------------------------------------------

create or replace function notificar_nueva_solicitud_vacaciones() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabajador trabajadores%rowtype;
begin
  select * into v_trabajador from trabajadores where id = new.trabajador_id;

  if v_trabajador.jefe_directo_id is not null and exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = v_trabajador.jefe_directo_id
      and tr.rol in ('jefatura', 'rrhh', 'administrador')
  ) then
    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      v_trabajador.jefe_directo_id,
      'Nueva solicitud de vacaciones',
      coalesce(v_trabajador.nombre_completo, 'Un trabajador') || ' solicitó vacaciones. Debes revisarla.',
      'solicitud_vacaciones_revision',
      new.id
    );
  end if;

  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  select distinct tr.trabajador_id,
    'Nueva solicitud de vacaciones',
    coalesce(v_trabajador.nombre_completo, 'Un trabajador') || ' solicitó vacaciones.',
    'solicitud_vacaciones_revision',
    new.id
  from trabajador_roles tr
  where tr.rol in ('rrhh', 'administrador')
    and tr.trabajador_id is distinct from v_trabajador.jefe_directo_id;

  return new;
end;
$$;

drop trigger if exists trg_notificar_nueva_solicitud_vacaciones on solicitudes_vacaciones;
create trigger trg_notificar_nueva_solicitud_vacaciones
  after insert on solicitudes_vacaciones
  for each row execute function notificar_nueva_solicitud_vacaciones();

-- 3) Certificado de antigüedad ----------------------------------------------

create or replace function notificar_nueva_solicitud_certificado() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  select nombre_completo into v_nombre from trabajadores where id = new.trabajador_id;

  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  select tr.trabajador_id,
    'Solicitud de Certificado de Antigüedad',
    coalesce(v_nombre, 'Un trabajador') || ' solicitó su certificado de antigüedad.',
    'certificado_antiguedad_solicitud',
    new.id
  from trabajador_roles tr
  where tr.rol in ('rrhh', 'administrador');

  return new;
end;
$$;

drop trigger if exists trg_notificar_nueva_solicitud_certificado on certificados_antiguedad;
create trigger trg_notificar_nueva_solicitud_certificado
  after insert on certificados_antiguedad
  for each row execute function notificar_nueva_solicitud_certificado();
