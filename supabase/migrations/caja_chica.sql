-- =========================================================
-- Módulo de Caja Chica (exclusivo para jefatura, RR.HH. y administrador).
-- Flujo: solicitud → aprobación (+ entrega física) → rendición (+
-- confirmación). Aplicar en el SQL Editor de Supabase. Seguro de
-- re-ejecutar completo.
--
-- Todo el acceso (lectura y escritura) pasa por las rutas /api/caja-chica/*
-- (con la llave de servicio), no directamente desde el navegador — por eso
-- las tablas quedan con RLS activado pero SIN políticas para
-- authenticated/anon (bloqueadas por defecto). Esto evita tener que
-- replicar en RLS toda la lógica de "quién puede ver/aprobar qué", que ya
-- vive centralizada en las rutas.
-- =========================================================

-- -----------------------------------------------------
-- 1. Períodos de caja chica. Solo puede haber uno abierto
--    (fecha_cierre is null) a la vez.
-- -----------------------------------------------------
create table if not exists caja_chica_periodos (
  id uuid primary key default gen_random_uuid(),
  monto_inicial numeric(12, 0) not null,
  fecha_inicio timestamptz not null default now(),
  fecha_cierre timestamptz,
  saldo_final numeric(12, 0),
  abierto_por uuid not null references trabajadores(id),
  cerrado_por uuid references trabajadores(id),
  notas text,
  created_at timestamptz not null default now()
);

create unique index if not exists caja_chica_periodos_unico_abierto
  on caja_chica_periodos ((fecha_cierre is null))
  where fecha_cierre is null;

alter table caja_chica_periodos enable row level security;

-- -----------------------------------------------------
-- 2. Solicitudes de compra.
--    estado: pendiente -> aprobada -> entregada -> rendicion_ingresada -> rendida
--                       -> rechazada (terminal, desde pendiente)
-- -----------------------------------------------------
create table if not exists caja_chica_solicitudes (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references caja_chica_periodos(id),
  solicitante_id uuid not null references trabajadores(id),
  monto_solicitado numeric(12, 0) not null check (monto_solicitado > 0),
  articulo text not null,
  razon text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'rechazada', 'aprobada', 'entregada', 'rendicion_ingresada', 'rendida')),

  aprobador_id uuid references trabajadores(id),
  fecha_resolucion timestamptz,
  motivo_rechazo text,

  entregado_por uuid references trabajadores(id),
  fecha_entrega timestamptz,

  monto_rendido numeric(12, 0),
  fecha_rendicion timestamptz,

  rendicion_confirmada_por uuid references trabajadores(id),
  fecha_confirmacion timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists caja_chica_solicitudes_periodo_idx on caja_chica_solicitudes (periodo_id);
create index if not exists caja_chica_solicitudes_solicitante_idx on caja_chica_solicitudes (solicitante_id);
create index if not exists caja_chica_solicitudes_estado_idx on caja_chica_solicitudes (estado);

alter table caja_chica_solicitudes enable row level security;

-- -----------------------------------------------------
-- 3. Comprobantes de la rendición (factura / boleta / vale por).
-- -----------------------------------------------------
create table if not exists caja_chica_comprobantes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references caja_chica_solicitudes(id) on delete cascade,
  tipo text not null check (tipo in ('factura', 'boleta', 'vale_por')),
  numero_documento text,
  monto numeric(12, 0) not null check (monto > 0),
  descripcion text,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists caja_chica_comprobantes_solicitud_idx
  on caja_chica_comprobantes (solicitud_id);

alter table caja_chica_comprobantes enable row level security;

-- -----------------------------------------------------
-- 4. Aprobadores de respaldo: quienes pueden aprobar una solicitud cuando
--    el solicitante no tiene un jefe directo con acceso al módulo (por
--    ejemplo, si el propio RR.HH./administrador solicita, o a alguien de
--    jefatura no se le ha asignado jefe directo). RR.HH. administra esta
--    lista desde la pantalla de Caja Chica.
-- -----------------------------------------------------
create table if not exists caja_chica_aprobadores_respaldo (
  trabajador_id uuid primary key references trabajadores(id) on delete cascade,
  agregado_por uuid references trabajadores(id),
  created_at timestamptz not null default now()
);

alter table caja_chica_aprobadores_respaldo enable row level security;

-- -----------------------------------------------------
-- 5. Bucket de Storage privado para los comprobantes (fotos/PDF de
--    facturas, boletas y vales por). Se guardan como
--    "<solicitante_id>/<solicitud_id>/archivo", igual que el bucket
--    "documentos" — se accede con URL firmada (createSignedUrl), no es
--    público.
-- -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('caja-chica', 'caja-chica', false)
on conflict (id) do update set public = false;

drop policy if exists "el solicitante sube sus propios comprobantes" on storage.objects;
create policy "el solicitante sube sus propios comprobantes"
  on storage.objects for insert
  with check (
    bucket_id = 'caja-chica'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "acceso a comprobantes de caja chica" on storage.objects;
create policy "acceso a comprobantes de caja chica"
  on storage.objects for select
  using (
    bucket_id = 'caja-chica'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from trabajador_roles tr
        where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
      )
      or exists (
        select 1 from trabajadores tr
        where tr.id::text = (storage.foldername(name))[1]
          and tr.jefe_directo_id = auth.uid()
      )
    )
  );

-- =========================================================
-- Fin.
-- =========================================================
