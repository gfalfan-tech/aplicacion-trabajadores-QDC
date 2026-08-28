-- =========================================================
-- Módulo de Rendición de Gastos (gerencia y ventas, vía el rol
-- 'rendicion_gastos' asignado individualmente en la ficha de cada
-- trabajador — igual que jefatura/rrhh/administrador).
--
-- Flujo: el trabajador arma la rendición de a poco (estado 'borrador',
-- con guardados parciales) y cuando está lista la envía. Desde ahí sigue
-- la MISMA doble aprobación que ya existe para vacaciones:
--   'pendiente' -> (jefe directo aprueba) -> 'aprobada_jefe'
--               -> (RR.HH./administrador aprueba) -> 'aprobada'
-- Si el trabajador no tiene jefe directo con acceso al sistema, se salta
-- la primera etapa y RR.HH. resuelve directo (mismo criterio que
-- vacaciones). Un rechazo en cualquier etapa termina el flujo ahí mismo.
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

-- -----------------------------------------------------
-- 1. Rendiciones (cabecera).
-- -----------------------------------------------------
create table if not exists rendiciones_gastos (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id),

  moneda text not null default 'CLP' check (moneda in ('CLP', 'USD')),
  tipo_cambio numeric(10, 2), -- solo si moneda = 'USD': valor del dólar ingresado a mano
  total_entregado_qdc numeric(14, 2) not null default 0,

  estado text not null default 'borrador'
    check (estado in ('borrador', 'pendiente', 'aprobada_jefe', 'aprobada', 'rechazada')),

  -- Primera firma (jefe directo). Ver comentario de doble_aprobacion_vacaciones.sql:
  -- mismo patrón exacto.
  aprobado_por_jefe uuid references trabajadores(id) on delete set null,
  fecha_aprobacion_jefe timestamptz,

  -- Decisión final: la de RR.HH. (segunda firma / "Finanzas"), la única
  -- decisión cuando no hay jefe directo válido, o el rechazo del jefe
  -- directo en la primera etapa (ahí también termina el flujo).
  aprobado_por uuid references trabajadores(id) on delete set null,
  fecha_resolucion timestamptz,
  comentario_resolucion text,

  fecha_envio timestamptz, -- cuándo pasó de 'borrador' a 'pendiente'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rendiciones_gastos_trabajador_idx on rendiciones_gastos (trabajador_id);
create index if not exists rendiciones_gastos_estado_idx on rendiciones_gastos (estado);

alter table rendiciones_gastos enable row level security;

-- El trabajador ve, crea y edita sus propias rendiciones. Una vez enviada
-- (estado distinto de 'borrador') deja de poder editarla directamente —
-- el envío y la resolución pasan por rutas de servidor que validan todo
-- server-side, igual que vacaciones.
drop policy if exists "el trabajador ve sus propias rendiciones" on rendiciones_gastos;
create policy "el trabajador ve sus propias rendiciones"
  on rendiciones_gastos for select
  using (trabajador_id = auth.uid());

-- Solo puede crear una rendición quien tiene el rol 'rendicion_gastos'
-- (gerencia/ventas, asignado individualmente en su ficha) — el menú ya lo
-- oculta para el resto, pero esto lo refuerza también a nivel de base de
-- datos, no solo en la interfaz.
drop policy if exists "el trabajador crea sus propias rendiciones" on rendiciones_gastos;
create policy "el trabajador crea sus propias rendiciones"
  on rendiciones_gastos for insert
  with check (
    trabajador_id = auth.uid()
    and estado = 'borrador'
    and exists (
      select 1 from trabajador_roles tr
      where tr.trabajador_id = auth.uid() and tr.rol = 'rendicion_gastos'
    )
  );

drop policy if exists "el trabajador edita su rendicion mientras es borrador" on rendiciones_gastos;
create policy "el trabajador edita su rendicion mientras es borrador"
  on rendiciones_gastos for update
  using (trabajador_id = auth.uid() and estado = 'borrador')
  with check (trabajador_id = auth.uid() and estado = 'borrador');

drop policy if exists "el trabajador borra su rendicion mientras es borrador" on rendiciones_gastos;
create policy "el trabajador borra su rendicion mientras es borrador"
  on rendiciones_gastos for delete
  using (trabajador_id = auth.uid() and estado = 'borrador');

-- Jefe directo y RR.HH./administrador pueden VER las rendiciones que les
-- corresponde revisar (el envío/resolución en sí lo hacen a través de
-- /api/rendicion-gastos/*, no con un update directo) — pero SOLO una vez
-- enviadas. Mientras sigue en 'borrador' nadie más que el propio
-- trabajador la ve, ni siquiera su jefe o RR.HH.
drop policy if exists "jefe o rrhh ven rendiciones para revisar" on rendiciones_gastos;
create policy "jefe o rrhh ven rendiciones para revisar"
  on rendiciones_gastos for select
  using (
    estado <> 'borrador'
    and (
      exists (
        select 1 from trabajador_roles tr
        where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
      )
      or exists (
        select 1 from trabajadores t
        where t.id = rendiciones_gastos.trabajador_id and t.jefe_directo_id = auth.uid()
      )
    )
  );

-- -----------------------------------------------------
-- 2. Líneas de gasto.
-- -----------------------------------------------------
create table if not exists rendicion_gastos_lineas (
  id uuid primary key default gen_random_uuid(),
  rendicion_id uuid not null references rendiciones_gastos(id) on delete cascade,

  fecha_gasto date not null,
  descripcion text not null,
  monto numeric(14, 2) not null check (monto > 0),
  categoria text not null
    check (categoria in ('combustible', 'peaje', 'transportes', 'hotel', 'alimentacion', 'comidas_negocio', 'otros')),
  tipo_documento text not null check (tipo_documento in ('factura', 'boleta', 'vale_por')),

  created_at timestamptz not null default now()
);

create index if not exists rendicion_gastos_lineas_rendicion_idx on rendicion_gastos_lineas (rendicion_id);

alter table rendicion_gastos_lineas enable row level security;

-- El trabajador ve sus propias líneas en cualquier estado (para poder
-- seguir viendo el detalle/PDF de una rendición ya enviada), pero solo
-- puede insertar/editar/borrar líneas mientras la rendición sigue en
-- 'borrador'. OJO: esto va en policies separadas por comando a propósito
-- — "for all" comparte una sola condición USING entre select/update/
-- delete, y eso habría dejado borrar líneas de una rendición ya
-- enviada/aprobada (el USING no reforzaba el estado 'borrador').
drop policy if exists "el trabajador administra lineas de su rendicion en borrador" on rendicion_gastos_lineas;

drop policy if exists "el trabajador ve lineas de sus rendiciones" on rendicion_gastos_lineas;
create policy "el trabajador ve lineas de sus rendiciones"
  on rendicion_gastos_lineas for select
  using (
    exists (
      select 1 from rendiciones_gastos r
      where r.id = rendicion_gastos_lineas.rendicion_id
        and r.trabajador_id = auth.uid()
    )
  );

drop policy if exists "el trabajador inserta lineas en su rendicion en borrador" on rendicion_gastos_lineas;
create policy "el trabajador inserta lineas en su rendicion en borrador"
  on rendicion_gastos_lineas for insert
  with check (
    exists (
      select 1 from rendiciones_gastos r
      where r.id = rendicion_gastos_lineas.rendicion_id
        and r.trabajador_id = auth.uid()
        and r.estado = 'borrador'
    )
  );

drop policy if exists "el trabajador edita lineas de su rendicion en borrador" on rendicion_gastos_lineas;
create policy "el trabajador edita lineas de su rendicion en borrador"
  on rendicion_gastos_lineas for update
  using (
    exists (
      select 1 from rendiciones_gastos r
      where r.id = rendicion_gastos_lineas.rendicion_id
        and r.trabajador_id = auth.uid()
        and r.estado = 'borrador'
    )
  )
  with check (
    exists (
      select 1 from rendiciones_gastos r
      where r.id = rendicion_gastos_lineas.rendicion_id
        and r.trabajador_id = auth.uid()
        and r.estado = 'borrador'
    )
  );

drop policy if exists "el trabajador borra lineas de su rendicion en borrador" on rendicion_gastos_lineas;
create policy "el trabajador borra lineas de su rendicion en borrador"
  on rendicion_gastos_lineas for delete
  using (
    exists (
      select 1 from rendiciones_gastos r
      where r.id = rendicion_gastos_lineas.rendicion_id
        and r.trabajador_id = auth.uid()
        and r.estado = 'borrador'
    )
  );

drop policy if exists "jefe o rrhh ven lineas de rendiciones para revisar" on rendicion_gastos_lineas;
create policy "jefe o rrhh ven lineas de rendiciones para revisar"
  on rendicion_gastos_lineas for select
  using (
    exists (
      select 1 from rendiciones_gastos r
      join trabajadores t on t.id = r.trabajador_id
      where r.id = rendicion_gastos_lineas.rendicion_id
        and r.estado <> 'borrador'
        and (
          t.jefe_directo_id = auth.uid()
          or exists (
            select 1 from trabajador_roles tr
            where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
          )
        )
    )
  );

-- -----------------------------------------------------
-- 3. Respaldos (fotos de factura/boleta) de cada línea.
-- -----------------------------------------------------
create table if not exists rendicion_gastos_respaldos (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references rendicion_gastos_lineas(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists rendicion_gastos_respaldos_linea_idx on rendicion_gastos_respaldos (linea_id);

alter table rendicion_gastos_respaldos enable row level security;

-- Mismo criterio que las líneas: select sin restricción de estado (para
-- poder seguir viendo los respaldos de una rendición ya enviada), pero
-- insert/delete solo mientras sigue en 'borrador' (no hay update: un
-- respaldo se reemplaza borrando y subiendo uno nuevo).
drop policy if exists "el trabajador administra respaldos de su rendicion en borrador" on rendicion_gastos_respaldos;

drop policy if exists "el trabajador ve respaldos de sus rendiciones" on rendicion_gastos_respaldos;
create policy "el trabajador ve respaldos de sus rendiciones"
  on rendicion_gastos_respaldos for select
  using (
    exists (
      select 1 from rendicion_gastos_lineas l
      join rendiciones_gastos r on r.id = l.rendicion_id
      where l.id = rendicion_gastos_respaldos.linea_id
        and r.trabajador_id = auth.uid()
    )
  );

drop policy if exists "el trabajador sube respaldos a su rendicion en borrador" on rendicion_gastos_respaldos;
create policy "el trabajador sube respaldos a su rendicion en borrador"
  on rendicion_gastos_respaldos for insert
  with check (
    exists (
      select 1 from rendicion_gastos_lineas l
      join rendiciones_gastos r on r.id = l.rendicion_id
      where l.id = rendicion_gastos_respaldos.linea_id
        and r.trabajador_id = auth.uid()
        and r.estado = 'borrador'
    )
  );

drop policy if exists "el trabajador borra respaldos de su rendicion en borrador" on rendicion_gastos_respaldos;
create policy "el trabajador borra respaldos de su rendicion en borrador"
  on rendicion_gastos_respaldos for delete
  using (
    exists (
      select 1 from rendicion_gastos_lineas l
      join rendiciones_gastos r on r.id = l.rendicion_id
      where l.id = rendicion_gastos_respaldos.linea_id
        and r.trabajador_id = auth.uid()
        and r.estado = 'borrador'
    )
  );

drop policy if exists "jefe o rrhh ven respaldos de rendiciones para revisar" on rendicion_gastos_respaldos;
create policy "jefe o rrhh ven respaldos de rendiciones para revisar"
  on rendicion_gastos_respaldos for select
  using (
    exists (
      select 1 from rendicion_gastos_lineas l
      join rendiciones_gastos r on r.id = l.rendicion_id
      join trabajadores t on t.id = r.trabajador_id
      where l.id = rendicion_gastos_respaldos.linea_id
        and r.estado <> 'borrador'
        and (
          t.jefe_directo_id = auth.uid()
          or exists (
            select 1 from trabajador_roles tr
            where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
          )
        )
    )
  );

-- -----------------------------------------------------
-- 4. Bucket de Storage privado para las fotos de respaldo. Mismo esquema
--    que "caja-chica": "<trabajador_id>/<rendicion_id>/<linea_id>/archivo",
--    acceso por URL firmada (createSignedUrl), no es público.
-- -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('rendicion-gastos', 'rendicion-gastos', false)
on conflict (id) do update set public = false;

drop policy if exists "el trabajador sube sus propios respaldos de rendicion" on storage.objects;
create policy "el trabajador sube sus propios respaldos de rendicion"
  on storage.objects for insert
  with check (
    bucket_id = 'rendicion-gastos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "el trabajador borra sus propios respaldos de rendicion" on storage.objects;
create policy "el trabajador borra sus propios respaldos de rendicion"
  on storage.objects for delete
  using (
    bucket_id = 'rendicion-gastos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "acceso a respaldos de rendicion de gastos" on storage.objects;
create policy "acceso a respaldos de rendicion de gastos"
  on storage.objects for select
  using (
    bucket_id = 'rendicion-gastos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from trabajador_roles tr
        where tr.trabajador_id = auth.uid() and tr.rol in ('rrhh', 'administrador')
      )
      or exists (
        select 1 from trabajadores t
        where t.id::text = (storage.foldername(name))[1]
          and t.jefe_directo_id = auth.uid()
      )
    )
  );

-- =========================================================
-- Fin.
-- =========================================================
