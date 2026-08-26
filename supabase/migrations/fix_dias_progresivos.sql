-- =========================================================
-- Corrige el cálculo de "días progresivos" del saldo de vacaciones.
--
-- Antes, la vista v_vacaciones_saldo calculaba los días progresivos
-- automáticamente como (años de antigüedad / 3) desde la fecha de
-- ingreso — lo que no respeta la ley chilena (recién se empieza a sumar
-- después de 10 años, y solo se puede saber con certeza si se toma en
-- cuenta el tiempo trabajado en otras empresas, algo que este sistema no
-- tiene forma de conocer).
--
-- Ahora los días progresivos SIEMPRE los ingresa manualmente RR.HH./
-- administrador (columna dias_progresivos_reconocidos en
-- vacaciones_saldo_inicial — ya existía y ya se editaba desde
-- RR.HH. → Trabajadores → Editar, pero la vista no la estaba usando) y,
-- desde la fecha de ese corte, el sistema suma 1 día más cada 3 años.
--
-- De paso se corrige que la vista tomaba CUALQUIER fila de
-- vacaciones_saldo_inicial por trabajador (si alguna vez queda más de
-- una — cada edición inserta una fila nueva — podía duplicar filas o
-- tomar una fila vieja); ahora toma siempre la más reciente por
-- fecha_corte, igual que ya hace la pantalla de RR.HH. al abrir la
-- edición de un trabajador.
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

create or replace function fn_dias_progresivos_vigentes(
  p_base numeric,
  p_fecha_corte date,
  p_fecha_ref date default current_date
) returns numeric
language sql
immutable
as $$
  select coalesce(p_base, 0)
    + greatest(0, extract(year from age(p_fecha_ref, p_fecha_corte))::int / 3);
$$;

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
  order by v.fecha_corte desc
  limit 1
) vsi on true;

-- La función anterior (fn_dias_progresivos, calculada solo desde
-- fecha_ingreso) queda sin usar por la vista pero no se borra, por si
-- algo más la referencia.
