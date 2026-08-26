-- =========================================================
-- Corrige un bug real: si a un trabajador se le crea/edita el saldo de
-- vacaciones más de una vez EL MISMO DÍA (por ejemplo: se crea la
-- cuenta hoy y RR.HH. edita los días pendientes hoy mismo, o RR.HH.
-- edita dos veces seguidas para probar), quedan dos filas en
-- vacaciones_saldo_inicial con la MISMA fecha_corte (esa columna es
-- solo fecha, sin hora).
--
-- La vista v_vacaciones_saldo tomaba "la fila con fecha_corte más
-- reciente" con "order by fecha_corte desc limit 1" — pero cuando hay
-- empate de fecha, Postgres NO garantiza cuál de las filas empatadas
-- devuelve primero. En la práctica puede devolver la fila VIEJA en vez
-- de la que RR.HH. acaba de guardar, y por eso el trabajador ve los
-- días de antes aunque RR.HH. sí guardó el cambio correctamente.
--
-- La solución: agregar una columna con fecha Y hora exacta de creación
-- (creado_en) y usarla como criterio de desempate, así la fila más
-- nueva siempre gana aunque la fecha_corte (solo fecha) sea igual.
--
-- Aplicar en el SQL Editor de Supabase ANTES de desplegar el código
-- nuevo (el código nuevo empieza a pedir la columna creado_en).
-- Seguro de re-ejecutar completo.
-- =========================================================

alter table vacaciones_saldo_inicial
  add column if not exists creado_en timestamptz not null default now();

-- Para las filas que ya existían (creadas antes de este cambio), no
-- tenemos la hora real — se deja el valor por defecto (now(), el
-- momento de correr esta migración), que de todos modos es más nuevo
-- que cualquier fila futura solo se compara correctamente hacia
-- adelante a partir de aquí.

create or replace view v_vacaciones_saldo as
select
  t.id as trabajador_id,
  t.nombre_completo,
  t.fecha_ingreso,
  coalesce(vsi.fecha_corte, t.fecha_ingreso) as fecha_corte,
  coalesce(vsi.dias_pendientes_base, 0::numeric) as dias_pendientes_base,
  fn_dias_progresivos_vigentes(
    vsi.dias_progresivos_reconocidos,
    coalesce(vsi.fecha_corte, t.fecha_ingreso)
  ) as dias_progresivos_vigentes,
  round(
    coalesce(vsi.dias_pendientes_base, 0::numeric)
    + (
        15 + fn_dias_progresivos_vigentes(
          vsi.dias_progresivos_reconocidos,
          coalesce(vsi.fecha_corte, t.fecha_ingreso)
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
  -- Desempata por creado_en (fecha Y hora exacta) para que, si hay dos
  -- filas con la misma fecha_corte, siempre gane la más reciente.
  order by v.fecha_corte desc, v.creado_en desc
  limit 1
) vsi on true;
