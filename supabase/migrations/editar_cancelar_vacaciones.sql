-- =========================================================
-- Permite a RR.HH./administrador editar las fechas o cancelar una
-- reserva de vacaciones ya aprobada (por ejemplo, por fuerza mayor).
--
-- Cancelar NO borra la solicitud: la deja en estado "cancelada" con el
-- motivo que escriba RR.HH., para que quede registro de que existió y
-- por qué se canceló (útil para auditoría o reclamos). El saldo de
-- vacaciones se libera automáticamente, porque v_vacaciones_saldo solo
-- resta los días de solicitudes en estado 'aprobada' — al pasar a
-- 'cancelada' deja de descontarse sin que haya que tocar nada más.
--
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

-- 'cancelada' es un valor nuevo del enum estado_solicitud (ya se usa
-- 'pendiente', 'aprobada', 'rechazada'). Los valores de enum no se pueden
-- agregar dentro de una transacción combinados con su uso inmediato, pero
-- como este ALTER va solo en su propio statement, es seguro.
alter type estado_solicitud add value if not exists 'cancelada';

alter table solicitudes_vacaciones
  add column if not exists editado_por uuid references trabajadores(id) on delete set null,
  add column if not exists editado_en timestamptz,
  add column if not exists motivo_edicion text;
