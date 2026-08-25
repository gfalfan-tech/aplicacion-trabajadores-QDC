-- =========================================================
-- Feriados legales de Chile, para descontarlos como "0" al calcular
-- los días hábiles de una solicitud de vacaciones (además de sábados
-- y domingos, que ya se excluían).
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

create table if not exists feriados (
  fecha date primary key,
  nombre text not null
);

alter table feriados enable row level security;

-- Cualquier persona logueada puede leer los feriados (se necesita en el
-- navegador para calcular los días hábiles de una solicitud).
drop policy if exists "cualquiera logueado lee los feriados" on feriados;
create policy "cualquiera logueado lee los feriados"
  on feriados for select
  using (auth.uid() is not null);

-- Solo RR.HH./administrador puede agregar feriados de años futuros o
-- corregir alguno.
drop policy if exists "rrhh administra los feriados" on feriados;
create policy "rrhh administra los feriados"
  on feriados for all
  using (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ))
  with check (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));

-- Feriados legales de Chile 2026 (verificados contra el calendario oficial).
insert into feriados (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-04-04', 'Sábado Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-21', 'Día de las Glorias Navales'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-16', 'Virgen del Carmen'),
  ('2026-08-15', 'Asunción de la Virgen'),
  ('2026-09-18', 'Independencia Nacional'),
  ('2026-09-19', 'Glorias del Ejército'),
  ('2026-10-12', 'Encuentro de Dos Mundos'),
  ('2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes'),
  ('2026-11-01', 'Día de Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad')
on conflict (fecha) do update set nombre = excluded.nombre;

-- Nota: cada año hay que cargar los feriados del año siguiente (algunos,
-- como San Pedro y San Pablo o el Encuentro de Dos Mundos, se corren al
-- lunes más cercano y cambian de fecha exacta año a año) — RR.HH. puede
-- agregarlos desde la nueva pantalla "Feriados" en el panel de RR.HH.,
-- o insertando filas directamente aquí.
