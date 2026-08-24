-- =========================================================
-- Foto de perfil y banner de portada por trabajador.
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

-- -----------------------------------------------------
-- 1. Columnas nuevas en trabajadores
-- -----------------------------------------------------
alter table trabajadores add column if not exists avatar_url text;
alter table trabajadores add column if not exists banner_url text;

-- -----------------------------------------------------
-- 2. Bucket de Storage "perfiles" (público, para que las fotos se
--    puedan mostrar en el mural, el directorio de mensajes, etc.)
-- -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('perfiles', 'perfiles', true)
on conflict (id) do update set public = true;

-- Cada archivo se guarda como "<trabajador_id>/avatar_....jpg" o
-- "<trabajador_id>/banner_....jpg" — estas políticas solo dejan a cada
-- quien subir/cambiar/borrar archivos dentro de SU PROPIA carpeta
-- (la lectura no necesita política porque el bucket es público).
drop policy if exists "cada quien sube su propia foto" on storage.objects;
create policy "cada quien sube su propia foto"
  on storage.objects for insert
  with check (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada quien reemplaza su propia foto" on storage.objects;
create policy "cada quien reemplaza su propia foto"
  on storage.objects for update
  using (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada quien borra su propia foto" on storage.objects;
create policy "cada quien borra su propia foto"
  on storage.objects for delete
  using (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------
-- 3. La vista de mensajería necesita la foto del otro participante
--    para mostrarla en la lista de conversaciones (chat privado).
--    Se re-crea completa con la misma definición de
--    supabase/migrations/mensajeria.sql más la columna nueva.
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
  ) as otro_id,
  (
    select t3.avatar_url
    from conversaciones_participantes cp4
    join trabajadores t3 on t3.id = cp4.trabajador_id
    where cp4.conversacion_id = c.id and cp4.trabajador_id <> mp.trabajador_id
    limit 1
  ) as otro_avatar_url
from conversaciones c
join conversaciones_participantes mp on mp.conversacion_id = c.id
where mp.trabajador_id = auth.uid();

-- -----------------------------------------------------
-- Fin. La actualización de avatar_url/banner_url en la tabla
-- trabajadores la hace la ruta /api/perfil/actualizar-foto (usa la
-- llave de servicio y valida la sesión), no directamente desde el
-- navegador — así que no hace falta una política de RLS nueva sobre
-- la tabla trabajadores para esto.
-- =========================================================
