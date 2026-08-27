-- =========================================================
-- Fix: en la lista de Mensajes, el nombre del otro participante a
-- veces aparecía como "Trabajador" en vez de su nombre real.
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
--
-- Causa: v_mis_conversaciones usa security_invoker = true (a propósito,
-- para que respete quién puede ver qué conversación), pero eso también
-- hacía que el JOIN interno para sacar el nombre/avatar del OTRO
-- participante quedara sujeto a la política RLS restrictiva de la
-- tabla "trabajadores" — la misma que en su momento nos obligó a crear
-- v_directorio_trabajadores para el Directorio. Si quien mira la lista
-- no tenía permiso para "ver" la ficha del otro en esa tabla, el JOIN
-- no traía nada y quedaba el genérico "Trabajador".
--
-- Arreglo: ese JOIN ahora usa v_directorio_trabajadores (la misma
-- vista sin restricciones que ya usa el Directorio) solo para sacar
-- nombre/avatar — la privacidad de CUÁLES conversaciones ve cada quien
-- sigue intacta (eso lo sigue controlando el "where mp.trabajador_id =
-- auth.uid()" de más abajo, que no cambia).
-- =========================================================

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
    join v_directorio_trabajadores t on t.id = cp2.trabajador_id
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
    join v_directorio_trabajadores t3 on t3.id = cp4.trabajador_id
    where cp4.conversacion_id = c.id and cp4.trabajador_id <> mp.trabajador_id
    limit 1
  ) as otro_avatar_url
from conversaciones c
join conversaciones_participantes mp on mp.conversacion_id = c.id
where mp.trabajador_id = auth.uid()
  and (
    mp.oculta_desde is null
    or exists (
      select 1 from mensajes m4
      where m4.conversacion_id = c.id and m4.creado_en > mp.oculta_desde
    )
  );
