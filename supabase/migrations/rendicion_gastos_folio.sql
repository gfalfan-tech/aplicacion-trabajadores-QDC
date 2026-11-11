-- =========================================================
-- Rendición de Gastos — folio correlativo (001, 002, ...)
-- =========================================================
-- El folio se asigna AUTOMÁTICAMENTE cuando la rendición se envía
-- (pasa de 'borrador' a 'pendiente'), así los borradores que se
-- eliminan no dejan números saltados. Aplicar en el SQL Editor de
-- Supabase DESPUÉS de rendicion_gastos_titulo.sql. Seguro de re-ejecutar.
-- =========================================================

alter table rendiciones_gastos
  add column if not exists folio int;

create unique index if not exists rendiciones_gastos_folio_unico
  on rendiciones_gastos (folio) where folio is not null;

create or replace function asignar_folio_rendicion_gastos()
returns trigger
language plpgsql
as $$
begin
  if new.folio is null and new.estado <> 'borrador' then
    -- Evita que dos envíos simultáneos tomen el mismo número.
    perform pg_advisory_xact_lock(hashtext('folio_rendicion_gastos'));
    select coalesce(max(folio), 0) + 1 into new.folio from rendiciones_gastos;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asignar_folio_rendicion_gastos on rendiciones_gastos;
create trigger trg_asignar_folio_rendicion_gastos
  before insert or update of estado on rendiciones_gastos
  for each row execute function asignar_folio_rendicion_gastos();

-- Rendiciones ya enviadas antes de este cambio: se numeran en el orden
-- en que se enviaron (la más antigua queda con el 001).
with ordenadas as (
  select id,
         coalesce((select max(folio) from rendiciones_gastos), 0)
           + row_number() over (order by coalesce(fecha_envio, created_at), created_at) as nuevo
    from rendiciones_gastos
   where folio is null and estado <> 'borrador'
)
update rendiciones_gastos r
   set folio = o.nuevo
  from ordenadas o
 where r.id = o.id;

-- Para verificar: debería mostrar la rendición de Jorge Martínez con folio 1
-- (si hay otras rendiciones de prueba ya enviadas, tendrán folios menores).
select r.folio, t.nombre_completo, r.titulo, r.estado, r.fecha_envio
  from rendiciones_gastos r
  join trabajadores t on t.id = r.trabajador_id
 where r.folio is not null
 order by r.folio;
