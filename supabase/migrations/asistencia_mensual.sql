-- =========================================================
-- Resumen mensual de asistencia (inasistencias y atrasos) por trabajador,
-- cargado por RR.HH. subiendo el "Reporte de asistencia simplificado" que
-- exporta el sistema de marcaje. Se usan los totales que ese mismo sistema
-- ya calculó para el período (días de inasistencia y minutos de atraso),
-- respetando los horarios reales configurados por trabajador.
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

create table if not exists asistencia_mensual (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  periodo_desde date not null,
  periodo_hasta date not null,
  dias_inasistencia integer not null default 0,
  atraso_minutos integer not null default 0,
  cantidad_atrasos integer not null default 0,
  salidas_anticipadas_cantidad integer not null default 0,
  dias_licencia_medica integer not null default 0,
  subido_por uuid references trabajadores(id),
  created_at timestamptz not null default now(),
  unique (trabajador_id, periodo_desde, periodo_hasta)
);

create index if not exists asistencia_mensual_trabajador_idx
  on asistencia_mensual (trabajador_id, periodo_desde desc);

alter table asistencia_mensual enable row level security;

-- Cada trabajador ve su propio resumen de asistencia.
drop policy if exists "cada trabajador ve su propia asistencia" on asistencia_mensual;
create policy "cada trabajador ve su propia asistencia"
  on asistencia_mensual for select
  using (trabajador_id = auth.uid());

-- Un jefe de jefatura ve la asistencia de quienes tienen a este trabajador
-- como jefe_directo.
drop policy if exists "jefatura ve la asistencia de su equipo" on asistencia_mensual;
create policy "jefatura ve la asistencia de su equipo"
  on asistencia_mensual for select
  using (exists (
    select 1 from trabajadores tr
    where tr.id = asistencia_mensual.trabajador_id
      and tr.jefe_directo_id = auth.uid()
  ));

-- RR.HH./administrador ve y administra todo.
drop policy if exists "rrhh administra la asistencia" on asistencia_mensual;
create policy "rrhh administra la asistencia"
  on asistencia_mensual for all
  using (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ))
  with check (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));
