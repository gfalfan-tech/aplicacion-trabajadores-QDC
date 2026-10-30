-- =========================================================
-- Paso 2 de 2: permiso "Publicar en el diario mural" para trabajadores que
-- tengan el rol 'publicar_mural' (se asigna en RR.HH. → Trabajadores → Editar).
--
-- Son políticas ADICIONALES: no tocan ni reemplazan las que ya permiten
-- publicar/eliminar a rrhh y administrador (en Postgres las políticas del
-- mismo tipo se suman con "o"). Quien tiene el rol puede:
--   * publicar (a su nombre) y subir imágenes al bucket 'mural'
--   * eliminar SOLO sus propias publicaciones
-- =========================================================

drop policy if exists "publicador del mural crea sus publicaciones" on publicaciones_mural;
create policy "publicador del mural crea sus publicaciones"
  on publicaciones_mural for insert to authenticated
  with check (
    publicado_por = auth.uid()
    and exists (
      select 1 from trabajador_roles tr
      where tr.trabajador_id = auth.uid() and tr.rol = 'publicar_mural'
    )
  );

drop policy if exists "publicador del mural elimina sus publicaciones" on publicaciones_mural;
create policy "publicador del mural elimina sus publicaciones"
  on publicaciones_mural for delete to authenticated
  using (
    publicado_por = auth.uid()
    and exists (
      select 1 from trabajador_roles tr
      where tr.trabajador_id = auth.uid() and tr.rol = 'publicar_mural'
    )
  );

-- Imágenes del mural (bucket 'mural')
drop policy if exists "publicador del mural sube imagenes" on storage.objects;
create policy "publicador del mural sube imagenes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mural'
    and exists (
      select 1 from trabajador_roles tr
      where tr.trabajador_id = auth.uid() and tr.rol = 'publicar_mural'
    )
  );
