-- =========================================================
-- Corrige a qué fecha queda "anclado" el próximo día progresivo de
-- vacaciones (el +1 día cada 3 años que se suma a los progresivos ya
-- reconocidos).
--
-- Hasta ahora, fn_dias_progresivos_vigentes contaba los 3 años desde
-- fecha_corte (la fecha en que RR.HH. hizo la última actualización
-- manual del saldo) — así que cada vez que se "pone al día" el saldo de
-- un trabajador, el conteo de 3 años para su próximo día progresivo se
-- reiniciaba desde ESE día.
--
-- La primera corrección que se iba a aplicar era anclar el conteo al
-- aniversario de ingreso del trabajador (sumar 1 cada 3 años desde su
-- fecha_ingreso). Se probó contra el informe real de RR.HH. y SÍ calza
-- para la mayoría de los trabajadores, pero falla para quienes tienen
-- antigüedad reconocida de empleadores anteriores (ej. alguien con 20+
-- años en la empresa a quien se le reconoció tiempo trabajado en otro
-- lado para este cálculo) — ahí el próximo día progresivo NO cae en un
-- múltiplo exacto de 3 años desde el ingreso en esta empresa, y no hay
-- forma de que el sistema adivine esa antigüedad externa por sí solo.
--
-- Por eso, en vez de recalcular la fecha, se guarda tal cual la fecha
-- exacta que ya determinó RR.HH. ("Próximo día progresivo") en una
-- columna nueva. La función ahora solo necesita saber: ¿ya pasó esa
-- fecha? Si no ha pasado, el valor vigente es el reconocido manualmente.
-- Si ya pasó, se suma 1 (el día que correspondía) más 1 adicional por
-- cada ciclo completo de 3 años que haya pasado desde esa fecha (por si
-- el saldo no se vuelve a actualizar por un tiempo largo).
--
-- Si un trabajador no tiene esta fecha registrada (ej. recién ingresado,
-- sin progresivos todavía), el valor queda fijo en el reconocido
-- manualmente hasta que RR.HH. la registre — no crece solo "a ciegas".
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

alter table vacaciones_saldo_inicial
  add column if not exists proximo_dia_progresivo_fecha date;

-- La vista v_vacaciones_saldo depende de la función — hay que borrar la
-- vista ANTES de poder borrar la función (si no, Postgres tira error
-- 2BP01 "cannot drop function ... because other objects depend on it").
drop view if exists v_vacaciones_saldo;

-- Mismos TIPOS de parámetros (numeric, date, date) que la versión
-- anterior (p_base, p_fecha_corte, p_fecha_ref), pero Postgres no deja
-- cambiar el NOMBRE de un parámetro con "create or replace function"
-- aunque el tipo no cambie (error 42P13) — hay que borrarla primero.
drop function if exists fn_dias_progresivos_vigentes(numeric, date, date);

create function fn_dias_progresivos_vigentes(
  p_base numeric,
  p_proximo_fecha date,
  p_fecha_ref date default current_date
) returns numeric
language sql
immutable
as $$
  select coalesce(p_base, 0)
    + case
        when p_proximo_fecha is null or p_fecha_ref < p_proximo_fecha then 0
        else 1 + floor(
          (
            extract(year from age(p_fecha_ref, p_proximo_fecha)) * 12
            + extract(month from age(p_fecha_ref, p_proximo_fecha))
          ) / 36
        )
      end;
$$;

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
