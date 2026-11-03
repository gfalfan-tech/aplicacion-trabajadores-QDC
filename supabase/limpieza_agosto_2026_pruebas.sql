-- Borra los permisos (9) y vacaciones (2) de PRUEBA aprobados en agosto de
-- 2026 (los que aparecen en Respaldos > Agosto 2026). No es una migración:
-- se ejecuta una sola vez, a mano, en el SQL Editor de Supabase.
--
-- No cambia ningún cálculo de vacaciones: el saldo solo suma las vacaciones
-- aprobadas con fecha_desde POSTERIOR a la fecha_corte (2026-10-09), y las
-- 2 de agosto empiezan el 2026-08-26 y el 2026-09-14, o sea antes del corte.

begin;

delete from solicitudes_permiso
where estado = 'aprobada'
  and to_char(fecha_resolucion at time zone 'America/Santiago', 'YYYY-MM') = '2026-08';

delete from solicitudes_vacaciones
where estado = 'aprobada'
  and to_char(fecha_resolucion at time zone 'America/Santiago', 'YYYY-MM') = '2026-08';

commit;
