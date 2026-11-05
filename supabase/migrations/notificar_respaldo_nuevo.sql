-- Aviso a sgonzalez@qdc.cl cada vez que un documento llega a "Respaldos".
--
-- Un documento llega a Respaldos cuando:
--   - un permiso queda 'aprobada'
--   - unas vacaciones quedan 'aprobada'
--   - una rendición de gastos queda 'aprobada'
--   - una caja chica queda 'rendida'
--
-- El trigger inserta una fila en "notificaciones" (campanita). El Database
-- Webhook que ya existe sobre esa tabla (/api/push/enviar) se encarga del
-- push y del correo, igual que con el resto de los avisos.
--
-- Solo reacciona a CAMBIOS de estado (UPDATE): los permisos/vacaciones que
-- un administrador registra ya aprobados desde cero no avisan.
-- Idempotente: se puede ejecutar más de una vez.

create or replace function fn_notificar_respaldo_nuevo() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino uuid;
  v_trabajador uuid;
  v_nombre text;
  v_tipo text;
  v_detalle text;
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  select id into v_destino
    from trabajadores
    where lower(email) = 'sgonzalez@qdc.cl'
    limit 1;
  if v_destino is null then
    return new;
  end if;

  if tg_table_name = 'solicitudes_permiso' and new.estado = 'aprobada' then
    v_tipo := 'respaldo_permiso';
    v_trabajador := new.trabajador_id;
    v_detalle := 'permiso ' ||
      case when new.fecha_desde = new.fecha_hasta
        then 'del ' || to_char(new.fecha_desde, 'DD-MM-YYYY')
        else 'del ' || to_char(new.fecha_desde, 'DD-MM-YYYY') || ' al ' || to_char(new.fecha_hasta, 'DD-MM-YYYY')
      end;
  elsif tg_table_name = 'solicitudes_vacaciones' and new.estado = 'aprobada' then
    v_tipo := 'respaldo_vacaciones';
    v_trabajador := new.trabajador_id;
    v_detalle := 'vacaciones ' ||
      case when new.fecha_desde = new.fecha_hasta
        then 'del ' || to_char(new.fecha_desde, 'DD-MM-YYYY')
        else 'del ' || to_char(new.fecha_desde, 'DD-MM-YYYY') || ' al ' || to_char(new.fecha_hasta, 'DD-MM-YYYY')
      end;
  elsif tg_table_name = 'rendiciones_gastos' and new.estado = 'aprobada' then
    v_tipo := 'respaldo_rendicion';
    v_trabajador := new.trabajador_id;
    v_detalle := 'rendición de gastos';
  elsif tg_table_name = 'caja_chica_solicitudes' and new.estado = 'rendida' then
    v_tipo := 'respaldo_caja_chica';
    v_trabajador := new.solicitante_id;
    v_detalle := 'caja chica rendida';
  else
    return new;
  end if;

  select nombre_completo into v_nombre from trabajadores where id = v_trabajador;

  insert into notificaciones (trabajador_id, titulo, cuerpo, relacionado_tipo, relacionado_id)
  values (
    v_destino,
    'Nuevo documento en Respaldos',
    'Llegó a Respaldos: ' || v_detalle || ' de ' || coalesce(v_nombre, 'un trabajador') || '.',
    v_tipo,
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_respaldo_permiso on solicitudes_permiso;
create trigger trg_respaldo_permiso
  after update of estado on solicitudes_permiso
  for each row execute function fn_notificar_respaldo_nuevo();

drop trigger if exists trg_respaldo_vacaciones on solicitudes_vacaciones;
create trigger trg_respaldo_vacaciones
  after update of estado on solicitudes_vacaciones
  for each row execute function fn_notificar_respaldo_nuevo();

drop trigger if exists trg_respaldo_rendicion on rendiciones_gastos;
create trigger trg_respaldo_rendicion
  after update of estado on rendiciones_gastos
  for each row execute function fn_notificar_respaldo_nuevo();

drop trigger if exists trg_respaldo_caja_chica on caja_chica_solicitudes;
create trigger trg_respaldo_caja_chica
  after update of estado on caja_chica_solicitudes
  for each row execute function fn_notificar_respaldo_nuevo();
