-- =========================================================
-- Saldo fijo en el comprobante de vacaciones.
--
-- Guarda, en el momento en que una solicitud de vacaciones pasa a
-- 'aprobada', el "Saldo pendiente días hábiles" que debe mostrar el PDF.
-- Así el comprobante queda con ese valor aunque se abra meses después
-- (antes se recalculaba con el saldo de hoy).
--
-- Funciona con un disparador en la base de datos, por lo que cubre todas
-- las vías de aprobación (panel RR.HH., API, enlace por correo, etc.).
--
-- - Las solicitudes ya aprobadas antes de este cambio quedan con NULL y
--   su PDF sigue usando el saldo actual (no se tocan).
-- - Si RR.HH. corrige los días de una aprobada, el saldo guardado se
--   ajusta por la diferencia.
--
-- Seguro de re-ejecutar.
-- =========================================================

alter table solicitudes_vacaciones
  add column if not exists saldo_pendiente_comprobante numeric;

create or replace function fn_fijar_saldo_comprobante_vacaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric;
  v_corte date;
begin
  if NEW.estado = 'aprobada' then
    if TG_OP = 'INSERT' or OLD.estado is distinct from 'aprobada' then
      -- Recién aprobada: la vista todavía NO descuenta esta solicitud
      -- (la fila aún no está guardada como aprobada), así que se resta aquí
      -- con el mismo criterio de la vista (solo si es posterior al corte).
      select s.dias_disponibles_estimados, s.fecha_corte
        into v_saldo, v_corte
        from v_vacaciones_saldo s
        where s.trabajador_id = NEW.trabajador_id;

      if v_saldo is not null then
        if v_corte is null or NEW.fecha_desde > v_corte then
          v_saldo := v_saldo - coalesce(NEW.dias_habiles, 0);
        end if;
        NEW.saldo_pendiente_comprobante := greatest(0, round(v_saldo, 2));
      end if;
    elsif NEW.saldo_pendiente_comprobante is not null
          and NEW.dias_habiles is distinct from OLD.dias_habiles then
      -- Corrección de fechas/días de una aprobada: ajusta por la diferencia.
      NEW.saldo_pendiente_comprobante := greatest(
        0,
        round(NEW.saldo_pendiente_comprobante + coalesce(OLD.dias_habiles, 0) - coalesce(NEW.dias_habiles, 0), 2)
      );
    end if;
  else
    NEW.saldo_pendiente_comprobante := null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_fijar_saldo_comprobante_vacaciones on solicitudes_vacaciones;

create trigger trg_fijar_saldo_comprobante_vacaciones
  before insert or update on solicitudes_vacaciones
  for each row
  execute function fn_fijar_saldo_comprobante_vacaciones();
