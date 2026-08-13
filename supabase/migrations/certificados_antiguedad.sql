-- =========================================================
-- Módulo: Certificado de Antigüedad + sistema de notificaciones
-- Aplicar en el SQL Editor de Supabase (kcxskzmmyjlamfambnhm)
-- Seguro de re-ejecutar completo.
-- =========================================================

-- -----------------------------------------------------
-- 1. Estado de la solicitud de certificado
-- -----------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_certificado') then
    create type estado_certificado as enum ('solicitado', 'en_firma', 'emitido');
  end if;
end $$;

-- -----------------------------------------------------
-- 2. Solicitudes de certificado de antigüedad
-- -----------------------------------------------------
create table if not exists certificados_antiguedad (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  estado estado_certificado not null default 'solicitado',
  requested_at timestamptz not null default now(),
  sent_to_signature_at timestamptz,
  issued_at timestamptz,
  issued_by uuid references trabajadores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table certificados_antiguedad enable row level security;

drop policy if exists "trabajador lee sus solicitudes" on certificados_antiguedad;
create policy "trabajador lee sus solicitudes"
  on certificados_antiguedad for select
  using (trabajador_id = auth.uid());

drop policy if exists "trabajador crea su solicitud" on certificados_antiguedad;
create policy "trabajador crea su solicitud"
  on certificados_antiguedad for insert
  with check (trabajador_id = auth.uid() and estado = 'solicitado');

drop policy if exists "rrhh lee todas las solicitudes" on certificados_antiguedad;
create policy "rrhh lee todas las solicitudes"
  on certificados_antiguedad for select
  using (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));

drop policy if exists "rrhh actualiza solicitudes" on certificados_antiguedad;
create policy "rrhh actualiza solicitudes"
  on certificados_antiguedad for update
  using (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));

-- -----------------------------------------------------
-- 3. Notificaciones (sistema general, reutilizable)
-- -----------------------------------------------------
create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  titulo text not null,
  cuerpo text not null,
  relacionado_tipo text,      -- ej. 'certificado_antiguedad'
  relacionado_id uuid,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notificaciones enable row level security;

drop policy if exists "trabajador lee sus notificaciones" on notificaciones;
create policy "trabajador lee sus notificaciones"
  on notificaciones for select
  using (trabajador_id = auth.uid());

drop policy if exists "trabajador marca sus notificaciones" on notificaciones;
create policy "trabajador marca sus notificaciones"
  on notificaciones for update
  using (trabajador_id = auth.uid())
  with check (trabajador_id = auth.uid());

drop policy if exists "rrhh crea notificaciones" on notificaciones;
create policy "rrhh crea notificaciones"
  on notificaciones for insert
  with check (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));

-- -----------------------------------------------------
-- 4. Trigger: notificación automática al pasar a "en_firma"
-- -----------------------------------------------------
create or replace function notificar_certificado_en_firma() returns trigger as $$
begin
  if new.estado = 'en_firma' and old.estado is distinct from 'en_firma' then
    insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
    values (
      new.trabajador_id,
      'Certificado de Antigüedad',
      'El documento solicitado ha pasado a firma, pronto estará disponible para retiro.',
      'certificado_antiguedad',
      new.id
    );
    new.sent_to_signature_at := now();
  end if;

  if new.estado = 'emitido' and old.estado is distinct from 'emitido' then
    new.issued_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notificar_certificado_en_firma on certificados_antiguedad;

create trigger trg_notificar_certificado_en_firma
  before update on certificados_antiguedad
  for each row execute function notificar_certificado_en_firma();

-- -----------------------------------------------------
-- Fin
-- -----------------------------------------------------
