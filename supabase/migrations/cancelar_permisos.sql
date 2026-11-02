-- =========================================================
-- Permite a RR.HH./administrador cancelar un permiso ya aprobado
-- (por ejemplo, si se aprobó por error).
--
-- Cancelar NO borra la solicitud: queda en estado "cancelada" con el
-- motivo, quién lo hizo y cuándo (mismo criterio que vacaciones). Los
-- permisos "cancelada" dejan de aparecer en Respaldos y de justificar
-- ausencias en el reporte de asistencia, porque ambos solo consideran
-- estado = 'aprobada'. Si era el permiso de cumpleaños, el beneficio del
-- año queda libre de nuevo (el índice único solo cuenta pendiente/aprobada).
--
-- El valor 'cancelada' del enum estado_solicitud ya existe (lo agregó
-- editar_cancelar_vacaciones.sql). Seguro de re-ejecutar.
-- Aplicar en el SQL Editor de Supabase.
-- =========================================================

alter table solicitudes_permiso
  add column if not exists editado_por uuid references trabajadores(id) on delete set null,
  add column if not exists editado_en timestamptz,
  add column if not exists motivo_edicion text;
