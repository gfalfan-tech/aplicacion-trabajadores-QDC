-- =========================================================
-- Agrega la columna pendiente_periodos_anteriores a la tabla
-- vacaciones_saldo_inicial, y actualiza la vista v_vacaciones_saldo
-- para:
--   1. Exponer pendiente_periodos_anteriores tal cual viene del Excel.
--   2. Exponer dias_usados_desde_corte (ya se calculaba internamente
--      pero no se exponía como columna propia).
--
-- Con estos dos valores, el frontend puede aplicar consumo FIFO:
--   pendientes = max(0, stored_pendientes - gastado)
--   periodo_actual = total - pendientes
--
-- Así el descuento de vacaciones baja primero los pendientes de
-- períodos anteriores, y solo cuando llegan a 0 baja el período
-- actual.
--
-- Seguro de re-ejecutar.
-- =========================================================

-- 1. Nueva columna en la tabla
alter table vacaciones_saldo_inicial
  add column if not exists pendiente_periodos_anteriores numeric default 0;

-- 2. Recrear la vista (hay que borrarla porque depende de la función)
drop view if exists v_vacaciones_saldo;

create view v_vacaciones_saldo as
select
  t.id as trabajador_id,
  t.nombre_completo,
  t.fecha_ingreso,
  coalesce(vsi.fecha_corte, t.fecha_ingreso) as fecha_corte,
  coalesce(vsi.dias_pendientes_base, 0::numeric) as dias_pendientes_base,
  fn_dias_progresivos_vigentes(
    vsi.dias_progresivos_reconocidos,
    vsi.proximo_dia_progresivo_fecha
  ) as dias_progresivos_vigentes,
  -- Valor que RR.HH. cargó desde el Excel: cuántos días pendientes de
  -- períodos anteriores tenía el trabajador a la fecha_corte.
  coalesce(vsi.pendiente_periodos_anteriores, 0::numeric) as pendiente_periodos_anteriores,
  -- Días hábiles de vacaciones aprobadas DESPUÉS de la fecha_corte
  -- (ya se calculaba internamente; ahora se expone para el FIFO).
  coalesce((
    select sum(sv.dias_habiles)
    from solicitudes_vacaciones sv
    where sv.trabajador_id = t.id
      and sv.estado = 'aprobada'::estado_solicitud
      and sv.fecha_desde > coalesce(vsi.fecha_corte, t.fecha_ingreso)
  ), 0::numeric) as dias_usados_desde_corte,
  -- Saldo total disponible (misma fórmula que antes)
  round(
    coalesce(vsi.dias_pendientes_base, 0::numeric)
    + (
        15 + fn_dias_progresivos_vigentes(
          vsi.dias_progresivos_reconocidos,
          vsi.proximo_dia_progresivo_fecha
        )
      )::numeric / 12::numeric
      * (
          extract(year from age(
            current_date::timestamp with time zone,
            coalesce(vsi.fecha_corte, t.fecha_ingreso)::timestamp with time zone
          )) * 12::numeric
          + extract(month from age(
            current_date::timestamp with time zone,
            coalesce(vsi.fecha_corte, t.fecha_ingreso)::timestamp with time zone
          ))
          + extract(day from age(
            current_date::timestamp with time zone,
            coalesce(vsi.fecha_corte, t.fecha_ingreso)::timestamp with time zone
          )) / 30::numeric
        )
    - coalesce((
        select sum(sv.dias_habiles)
        from solicitudes_vacaciones sv
        where sv.trabajador_id = t.id
          and sv.estado = 'aprobada'::estado_solicitud
          and sv.fecha_desde > coalesce(vsi.fecha_corte, t.fecha_ingreso)
      ), 0::numeric),
    2
  ) as dias_disponibles_estimados
from trabajadores t
left join lateral (
  select *
  from vacaciones_saldo_inicial v
  where v.trabajador_id = t.id
  order by v.fecha_corte desc, v.creado_en desc
  limit 1
) vsi on true;
