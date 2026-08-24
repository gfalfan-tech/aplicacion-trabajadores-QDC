-- =========================================================
-- Notificaciones del Mural: comentarios y reacciones
-- Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Avisa (en la tabla `notificaciones`, ya existente) a quien publicó
-- una publicación del mural y a quienes ya habían comentado en ella,
-- cada vez que llega un comentario o una reacción nueva (excepto a
-- quien acaba de comentar/reaccionar, para no auto-notificarse).
-- =========================================================

-- -----------------------------------------------------
-- 1. Comentarios nuevos
-- -----------------------------------------------------
create or replace function notificar_mural_comentario() returns trigger as $$
declare
  v_nombre text;
  v_titulo_pub text;
  v_texto_notif text;
begin
  select nombre_completo into v_nombre from trabajadores where id = new.trabajador_id;
  select titulo into v_titulo_pub from publicaciones_mural where id = new.publicacion_id;

  v_texto_notif := coalesce(v_nombre, 'Alguien') || ' comentó en "' || coalesce(v_titulo_pub, 'una publicación') || '": "'
    || left(new.texto, 80) || case when length(new.texto) > 80 then '…' else '' end || '"';

  with destinatarios as (
    select distinct mc.trabajador_id
    from mural_comentarios mc
    where mc.publicacion_id = new.publicacion_id
      and mc.trabajador_id <> new.trabajador_id
    union
    select p.publicado_por
    from publicaciones_mural p
    where p.id = new.publicacion_id
      and p.publicado_por is not null
      and p.publicado_por <> new.trabajador_id
  )
  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  select d.trabajador_id, 'Nuevo comentario en el mural', v_texto_notif, 'mural_comentario', new.publicacion_id
  from destinatarios d;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notificar_mural_comentario on mural_comentarios;
create trigger trg_notificar_mural_comentario
  after insert on mural_comentarios
  for each row execute function notificar_mural_comentario();

-- -----------------------------------------------------
-- 2. Reacciones nuevas
-- -----------------------------------------------------
create or replace function notificar_mural_reaccion() returns trigger as $$
declare
  v_nombre text;
  v_titulo_pub text;
begin
  select nombre_completo into v_nombre from trabajadores where id = new.trabajador_id;
  select titulo into v_titulo_pub from publicaciones_mural where id = new.publicacion_id;

  with destinatarios as (
    select distinct mc.trabajador_id
    from mural_comentarios mc
    where mc.publicacion_id = new.publicacion_id
      and mc.trabajador_id <> new.trabajador_id
    union
    select p.publicado_por
    from publicaciones_mural p
    where p.id = new.publicacion_id
      and p.publicado_por is not null
      and p.publicado_por <> new.trabajador_id
  )
  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  select
    d.trabajador_id,
    'Nueva reacción en el mural',
    coalesce(v_nombre, 'Alguien') || ' reaccionó en "' || coalesce(v_titulo_pub, 'una publicación') || '".',
    'mural_reaccion',
    new.publicacion_id
  from destinatarios d;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notificar_mural_reaccion on mural_reacciones;
create trigger trg_notificar_mural_reaccion
  after insert on mural_reacciones
  for each row execute function notificar_mural_reaccion();
