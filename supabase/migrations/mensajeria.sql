-- =========================================================
-- Mensajería interna: chats privados y grupos
-- Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Privacidad: los mensajes solo los pueden leer los participantes de
-- esa conversación. No existe ninguna política que le dé acceso a
-- RRHH ni a administradores — a propósito, para que nadie más pueda
-- leer chats privados de otras personas.
-- =========================================================

-- -----------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------
create table if not exists conversaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('privada', 'grupo')),
  nombre text,
  creado_por uuid not null references trabajadores(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table if not exists conversaciones_participantes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  es_admin boolean not null default false,
  unido_en timestamptz not null default now(),
  ultima_lectura timestamptz,
  unique (conversacion_id, trabajador_id)
);

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  texto text not null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_participantes_conversacion on conversaciones_participantes(conversacion_id);
create index if not exists idx_participantes_trabajador on conversaciones_participantes(trabajador_id);
create index if not exists idx_mensajes_conversacion on mensajes(conversacion_id, creado_en);

-- -----------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------
alter table conversaciones enable row level security;
alter table conversaciones_participantes enable row level security;
alter table mensajes enable row level security;

-- --- conversaciones ---
drop policy if exists "participante lee su conversacion" on conversaciones;
create policy "participante lee su conversacion"
  on conversaciones for select
  using (exists (
    select 1 from conversaciones_participantes cp
    where cp.conversacion_id = conversaciones.id and cp.trabajador_id = auth.uid()
  ));

drop policy if exists "cualquiera crea una conversacion" on conversaciones;
create policy "cualquiera crea una conversacion"
  on conversaciones for insert
  with check (creado_por = auth.uid());

drop policy if exists "admin elimina su grupo" on conversaciones;
create policy "admin elimina su grupo"
  on conversaciones for delete
  using (
    tipo = 'grupo'
    and exists (
      select 1 from conversaciones_participantes cp
      where cp.conversacion_id = conversaciones.id
        and cp.trabajador_id = auth.uid()
        and cp.es_admin = true
    )
  );

-- --- conversaciones_participantes ---
drop policy if exists "participante ve la lista de su conversacion" on conversaciones_participantes;
create policy "participante ve la lista de su conversacion"
  on conversaciones_participantes for select
  using (exists (
    select 1 from conversaciones_participantes cp2
    where cp2.conversacion_id = conversaciones_participantes.conversacion_id
      and cp2.trabajador_id = auth.uid()
  ));

drop policy if exists "creador o admin agrega participantes" on conversaciones_participantes;
create policy "creador o admin agrega participantes"
  on conversaciones_participantes for insert
  with check (
    exists (
      select 1 from conversaciones c
      where c.id = conversacion_id and c.creado_por = auth.uid()
    )
    or exists (
      select 1 from conversaciones_participantes cp
      where cp.conversacion_id = conversaciones_participantes.conversacion_id
        and cp.trabajador_id = auth.uid()
        and cp.es_admin = true
    )
  );

drop policy if exists "participante actualiza su propia lectura" on conversaciones_participantes;
create policy "participante actualiza su propia lectura"
  on conversaciones_participantes for update
  using (trabajador_id = auth.uid())
  with check (trabajador_id = auth.uid());

drop policy if exists "admin quita participantes o uno se sale" on conversaciones_participantes;
create policy "admin quita participantes o uno se sale"
  on conversaciones_participantes for delete
  using (
    trabajador_id = auth.uid()
    or exists (
      select 1 from conversaciones_participantes cp
      where cp.conversacion_id = conversaciones_participantes.conversacion_id
        and cp.trabajador_id = auth.uid()
        and cp.es_admin = true
    )
  );

-- --- mensajes ---
drop policy if exists "participante lee mensajes de su conversacion" on mensajes;
create policy "participante lee mensajes de su conversacion"
  on mensajes for select
  using (exists (
    select 1 from conversaciones_participantes cp
    where cp.conversacion_id = mensajes.conversacion_id and cp.trabajador_id = auth.uid()
  ));

drop policy if exists "participante envia mensajes" on mensajes;
create policy "participante envia mensajes"
  on mensajes for insert
  with check (
    trabajador_id = auth.uid()
    and exists (
      select 1 from conversaciones_participantes cp
      where cp.conversacion_id = mensajes.conversacion_id and cp.trabajador_id = auth.uid()
    )
  );

drop policy if exists "autor elimina su mensaje" on mensajes;
create policy "autor elimina su mensaje"
  on mensajes for delete
  using (trabajador_id = auth.uid());

-- -----------------------------------------------------
-- 3. Vista de resumen: mis conversaciones, con no leídos y
--    último mensaje. security_invoker para que respete la RLS
--    de quien está consultando (no de quien creó la vista).
-- -----------------------------------------------------
drop view if exists v_mis_conversaciones;
create view v_mis_conversaciones
with (security_invoker = true)
as
select
  c.id as conversacion_id,
  c.tipo,
  c.nombre,
  c.creado_por,
  mp.trabajador_id as yo_id,
  mp.es_admin,
  mp.ultima_lectura,
  (
    select count(*) from mensajes m
    where m.conversacion_id = c.id
      and m.trabajador_id <> mp.trabajador_id
      and m.creado_en > coalesce(mp.ultima_lectura, 'epoch'::timestamptz)
  ) as no_leidos,
  (
    select m2.texto from mensajes m2
    where m2.conversacion_id = c.id
    order by m2.creado_en desc limit 1
  ) as ultimo_texto,
  (
    select m2.creado_en from mensajes m2
    where m2.conversacion_id = c.id
    order by m2.creado_en desc limit 1
  ) as ultimo_en,
  (
    select string_agg(t.nombre_completo, ', ' order by t.nombre_completo)
    from conversaciones_participantes cp2
    join trabajadores t on t.id = cp2.trabajador_id
    where cp2.conversacion_id = c.id and cp2.trabajador_id <> mp.trabajador_id
  ) as otros_nombres,
  (
    -- solo tiene sentido para conversaciones tipo 'privada' (2 participantes)
    select cp3.trabajador_id
    from conversaciones_participantes cp3
    where cp3.conversacion_id = c.id and cp3.trabajador_id <> mp.trabajador_id
    limit 1
  ) as otro_id
from conversaciones c
join conversaciones_participantes mp on mp.conversacion_id = c.id
where mp.trabajador_id = auth.uid();

-- -----------------------------------------------------
-- 4. Realtime: para que los mensajes lleguen en vivo.
--    (Si ya estaban agregadas, este bloque no falla.)
-- -----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes'
  ) then
    alter publication supabase_realtime add table mensajes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversaciones_participantes'
  ) then
    alter publication supabase_realtime add table conversaciones_participantes;
  end if;
end $$;
