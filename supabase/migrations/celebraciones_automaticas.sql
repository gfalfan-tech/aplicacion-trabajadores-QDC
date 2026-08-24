-- =========================================================
-- Publicaciones automáticas de cumpleaños y aniversario
-- Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Esta tabla solo registra qué se publicó automáticamente, para:
--  1) Evitar publicar dos veces el mismo cumpleaños/aniversario el mismo
--     año (columna unique más abajo).
--  2) Saber qué plantilla (1-20) le toca al próximo cumpleaños, rotando
--     en orden 1→2→…→20→1… según cuántas ya se publicaron.
-- No guarda las imágenes ni nada sensible — solo referencias.
-- =========================================================

create table if not exists mural_auto_publicaciones (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  tipo text not null check (tipo in ('cumpleanos', 'aniversario')),
  anio integer not null,
  plantilla integer,
  publicacion_id uuid references publicaciones_mural(id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (trabajador_id, tipo, anio)
);

create index if not exists idx_auto_pub_tipo on mural_auto_publicaciones(tipo);

alter table mural_auto_publicaciones enable row level security;

-- Solo RRHH/administrador puede leer este registro (es información interna
-- de auditoría, no algo que necesite ver un trabajador cualquiera). Las
-- escrituras las hace únicamente el proceso automático, que usa la llave de
-- servicio de Supabase y por lo tanto no pasa por RLS.
drop policy if exists "rrhh lee publicaciones automaticas" on mural_auto_publicaciones;
create policy "rrhh lee publicaciones automaticas"
  on mural_auto_publicaciones for select
  using (exists (
    select 1 from trabajador_roles tr
    where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
  ));

-- -----------------------------------------------------
-- Fin
-- -----------------------------------------------------
