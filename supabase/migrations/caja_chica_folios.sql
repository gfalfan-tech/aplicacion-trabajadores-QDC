-- =========================================================
-- Caja chica: folios y cierre con solicitud de reintegro.
--
-- Cada período (cada "caja") tiene un número de folio correlativo
-- (0001, 0002, ...). Al terminar el fondo, RR.HH./administrador:
--   1) "Aprueba la rendición de la caja": ingresa el efectivo contado y
--      el monto a reintegrar. Desde ahí no se aceptan más solicitudes.
--   2) Descarga el PDF de solicitud de reintegro (con todos los
--      movimientos y respaldos).
--   3) Cuando llega el dinero, registra la recarga: se cierra el folio y
--      se abre el siguiente, que parte con efectivo contado + recarga.
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

alter table caja_chica_periodos
  add column if not exists folio int,
  add column if not exists rendicion_aprobada_at timestamptz,
  add column if not exists rendicion_aprobada_por uuid references trabajadores(id),
  add column if not exists efectivo_contado numeric(12, 0),
  add column if not exists diferencia_cuadratura numeric(12, 0),
  add column if not exists observacion_cuadratura text,
  add column if not exists monto_reintegro numeric(12, 0),
  add column if not exists monto_recargado numeric(12, 0),
  add column if not exists codigo_verificacion text;

-- Folio correlativo automático al crear un período nuevo.
create or replace function asignar_folio_caja_chica()
returns trigger
language plpgsql
as $$
begin
  if new.folio is null then
    select coalesce(max(folio), 0) + 1 into new.folio from caja_chica_periodos;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asignar_folio_caja_chica on caja_chica_periodos;
create trigger trg_asignar_folio_caja_chica
  before insert on caja_chica_periodos
  for each row execute function asignar_folio_caja_chica();

create unique index if not exists caja_chica_periodos_folio_unico
  on caja_chica_periodos (folio) where folio is not null;

-- Si ya existiera un período abierto sin folio, se le asigna el siguiente.
update caja_chica_periodos
   set folio = (select coalesce(max(folio), 0) + 1 from caja_chica_periodos)
 where fecha_cierre is null and folio is null;
