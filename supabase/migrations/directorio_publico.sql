-- =========================================================
-- Directorio público de colaboradores.
-- Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Objetivo: que CUALQUIER trabajador autenticado pueda (1) ver a todos
-- sus colaboradores en el directorio de Mensajes para iniciar un chat
-- con cualquiera (hoy la RLS de "trabajadores" es restrictiva y solo
-- deja ver a algunos), y (2) buscar y ver el perfil básico de otro
-- colaborador (foto, nombre, cargo, área, jefe directo).
--
-- No tocamos la política RLS existente de "trabajadores" (no sabemos
-- su definición exacta y no queremos arriesgar romper otra pantalla).
-- En vez de eso creamos una VISTA con solo las columnas "seguras" —
-- sin RUT, fecha de nacimiento, teléfono personal ni tipo de contrato.
--
-- Nota técnica: una vista normal (sin "security_invoker = true") se
-- evalúa con los permisos y las políticas RLS del DUEÑO de la vista
-- (normalmente "postgres", que tiene bypassrls), no con los del
-- usuario que consulta. Por eso esta vista sí puede leer todas las
-- filas de "trabajadores" aunque la política restrictiva original
-- siga intacta — la vista es la única puerta abierta, y solo expone
-- las columnas seguras.
-- =========================================================

drop view if exists v_directorio_trabajadores;

create view v_directorio_trabajadores as
select
  t.id,
  t.nombre_completo,
  t.cargo,
  t.avatar_url,
  t.banner_url,
  t.fecha_ingreso,
  a.nombre as area_nombre,
  t.jefe_directo_id,
  j.nombre_completo as jefe_nombre
from trabajadores t
left join areas a on a.id = t.area_id
left join trabajadores j on j.id = t.jefe_directo_id;

grant select on v_directorio_trabajadores to authenticated;
