-- =========================================================
-- Licencias médicas: registro administrativo de días con licencia médica
-- que RR.HH./administrador ingresa directamente (sin flujo de aprobación
-- — a diferencia de vacaciones/permisos, acá RR.HH. ya tiene el
-- certificado en la mano, no hace falta que nadie más lo autorice).
--
-- Sirve para que el módulo de asistencia (ver
-- app/api/admin/subir-asistencia/route.js y
-- components/ModalDetalleAsistencia.js) pueda explicar los días que el
-- reporte de marcaje muestra sin marca de asistencia o con atraso, cuando
-- en realidad corresponden a una licencia médica ya registrada en la app
-- (independiente de si el sistema de marcaje también la trae marcada).
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

create table if not exists licencias_medicas (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  comentario text,
  respaldo_storage_path text, -- foto/PDF del certificado médico, opcional
  registrado_por uuid references trabajadores(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint licencias_medicas_fechas_check check (fecha_hasta >= fecha_desde)
);

create index if not exists licencias_medicas_trabajador_idx
  on licencias_medicas (trabajador_id, fecha_desde desc);

alter table licencias_medicas enable row level security;

-- El trabajador ve sus propias licencias registradas (referencia — no las
-- crea ni las edita, eso es exclusivo de RR.HH./administrador).
drop policy if exists "el trabajador ve sus propias licencias medicas" on licencias_medicas;
create policy "el trabajador ve sus propias licencias medicas"
  on licencias_medicas for select
  using (trabajador_id = auth.uid());

-- RR.HH./administrador administra todo (crear, ver, editar, borrar) —
-- mismo criterio que asistencia_mensual.
drop policy if exists "rrhh administra las licencias medicas" on licencias_medicas;
create policy "rrhh administra las licencias medicas"
  on licencias_medicas for all
  using (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ))
  with check (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));

-- -----------------------------------------------------
-- Bucket de Storage privado para el certificado médico adjunto (opcional).
-- Mismo esquema que "rendicion-gastos": "<trabajador_id>/<licencia_id>/archivo",
-- acceso por URL firmada (createSignedUrl), no es público. A diferencia de
-- rendición de gastos, acá quien sube el archivo es RR.HH./administrador
-- (no el propio trabajador).
-- -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('licencias-medicas', 'licencias-medicas', false)
on conflict (id) do update set public = false;

drop policy if exists "rrhh sube respaldos de licencias medicas" on storage.objects;
create policy "rrhh sube respaldos de licencias medicas"
  on storage.objects for insert
  with check (
    bucket_id = 'licencias-medicas'
    and exists (
      select 1 from trabajador_roles tr
      where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
    )
  );

drop policy if exists "rrhh borra respaldos de licencias medicas" on storage.objects;
create policy "rrhh borra respaldos de licencias medicas"
  on storage.objects for delete
  using (
    bucket_id = 'licencias-medicas'
    and exists (
      select 1 from trabajador_roles tr
      where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
    )
  );

drop policy if exists "acceso a respaldos de licencias medicas" on storage.objects;
create policy "acceso a respaldos de licencias medicas"
  on storage.objects for select
  using (
    bucket_id = 'licencias-medicas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from trabajador_roles tr
        where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
      )
    )
  );

-- =========================================================
-- Fin.
-- =========================================================
