-- =========================================================
-- Aprobador adicional de Caja Chica POR TRABAJADOR.
-- Permite que, para las solicitudes de caja chica de un trabajador
-- (ej. Francisco Corral), otra persona pueda aprobar/rechazar ADEMÁS de
-- su jefe directo. Solo afecta a Caja Chica: el jefe directo del
-- trabajador en el resto de la app no cambia. Seguro de re-ejecutar.
-- Aplicar en el SQL Editor de Supabase.
-- =========================================================
create table if not exists caja_chica_aprobadores_adicionales (
  solicitante_id uuid not null references trabajadores(id) on delete cascade,
  aprobador_id uuid not null references trabajadores(id) on delete cascade,
  agregado_por uuid references trabajadores(id),
  created_at timestamptz not null default now(),
  primary key (solicitante_id, aprobador_id),
  check (solicitante_id <> aprobador_id)
);

-- Igual que el resto de Caja Chica: solo se accede por las rutas
-- /api/caja-chica/* (llave de servicio); RLS activo sin políticas.
alter table caja_chica_aprobadores_adicionales enable row level security;
