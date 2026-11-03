-- =========================================================
-- Formalización de papeletas: cuando un permiso o unas vacaciones quedan
-- aprobados, la papeleta se imprime, se firma a mano y recién ahí se marca
-- como "formalizada". Sirve para que quien controla (Sandra) sepa qué
-- falta imprimir/firmar.
--
-- Se guarda como un campo APARTE del estado: el estado 'aprobada' no cambia,
-- así que no se altera ningún cálculo de saldo de vacaciones, asistencia ni
-- informes.
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar.
-- =========================================================

-- 1) Rol nuevo, asignable desde RR.HH. → Trabajadores (casilla "formalizar papeletas")
alter type rol_tipo add value if not exists 'formalizar_papeletas';

-- 2) Columnas en permisos y vacaciones + 3) lo que ya estaba aprobado antes
--    de este cambio parte como formalizado. El "parte como formalizado" se
--    hace SOLO la primera vez (cuando la columna todavía no existe), para que
--    volver a ejecutar este script no vuelva a marcar lo que alguien haya
--    desmarcado después.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'solicitudes_permiso' and column_name = 'formalizada_at'
  ) then
    alter table solicitudes_permiso
      add column formalizada_at timestamptz,
      add column formalizada_por uuid references trabajadores(id) on delete set null;
    update solicitudes_permiso
      set formalizada_at = coalesce(fecha_resolucion, now())
      where estado = 'aprobada';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'solicitudes_vacaciones' and column_name = 'formalizada_at'
  ) then
    alter table solicitudes_vacaciones
      add column formalizada_at timestamptz,
      add column formalizada_por uuid references trabajadores(id) on delete set null;
    update solicitudes_vacaciones
      set formalizada_at = coalesce(fecha_resolucion, now())
      where estado = 'aprobada';
  end if;
end $$;
