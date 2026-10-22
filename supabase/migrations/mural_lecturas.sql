-- =========================================================
-- Aviso de "publicación nueva sin leer" en el ícono del Diario mural.
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
--
-- Guarda, por trabajador, hasta qué publicación del mural ya vio
-- (visto_hasta = fecha de la publicación más reciente que tenía en
-- pantalla al abrir el mural). El aviso del inicio cuenta las
-- publicaciones posteriores a esa fecha.
--
-- Es una tabla nueva e independiente: no modifica ninguna tabla existente.
-- Mientras no se aplique, la app simplemente no muestra el aviso.
-- =========================================================

create table if not exists mural_lecturas (
  trabajador_id uuid primary key references trabajadores(id) on delete cascade,
  visto_hasta timestamptz not null,
  actualizado_en timestamptz not null default now()
);

alter table mural_lecturas enable row level security;

drop policy if exists "cada trabajador administra su lectura del mural" on mural_lecturas;
create policy "cada trabajador administra su lectura del mural"
  on mural_lecturas for all to authenticated
  using (trabajador_id = auth.uid())
  with check (trabajador_id = auth.uid());
