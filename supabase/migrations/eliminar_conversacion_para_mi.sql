-- =========================================================
-- Eliminar una conversación "solo para mí".
-- Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Al "eliminar" una conversación (privada o grupo) esta deja de
-- aparecer en la lista de Mensajes de quien la eliminó, pero el resto
-- de los participantes la sigue viendo normal, con todo su historial.
-- Si más adelante llega un mensaje nuevo, la conversación vuelve a
-- aparecer automáticamente (como en WhatsApp) — no es "salir del
-- grupo" ni borra nada para los demás, solo oculta el hilo.
--
-- No se borra la fila de conversaciones_participantes (eso sí
-- significaría dejar la conversación / dejar de recibir mensajes) —
-- solo se guarda desde cuándo la ocultó cada quien, y la vista
-- v_mis_conversaciones la filtra mientras no haya mensajes nuevos
-- después de esa fecha.
-- =========================================================

alter table conversaciones_participantes
  add column if not exists oculta_desde timestamptz;

-- La política de UPDATE que ya existe ("participante actualiza su
-- propia lectura": using/with check trabajador_id = auth.uid()) ya
-- cubre esta columna nueva — no hace falta una política adicional.

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
where mp.trabajador_id = auth.uid()
  and (
    mp.oculta_desde is null
    or exists (
      select 1 from mensajes m4
      where m4.conversacion_id = c.id and m4.creado_en > mp.oculta_desde
    )
  );
