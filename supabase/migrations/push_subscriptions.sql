-- =========================================================
-- Suscripciones a notificaciones push (Web Push) por dispositivo. Cada
-- trabajador puede tener más de una (celular, notebook, etc.). Se guardan
-- para poder enviarle un push cuando se crea una fila nueva en
-- "notificaciones" (ver el Database Webhook que hay que configurar en el
-- panel de Supabase, descrito en el mensaje de esta entrega).
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_trabajador_idx
  on push_subscriptions (trabajador_id);

alter table push_subscriptions enable row level security;

-- Cada trabajador administra sus propias suscripciones (las crea/borra su
-- propio navegador al activar o desactivar notificaciones en ese
-- dispositivo).
drop policy if exists "cada trabajador administra sus suscripciones" on push_subscriptions;
create policy "cada trabajador administra sus suscripciones"
  on push_subscriptions for all
  using (trabajador_id = auth.uid())
  with check (trabajador_id = auth.uid());
