-- =========================================================
-- Agrega el detalle día por día de atrasos e inasistencias a la asistencia
-- mensual, para poder mostrarlo al hacer clic en un trabajador (antes solo
-- se guardaba el total del mes). Aplicar en el SQL Editor de Supabase.
-- Seguro de re-ejecutar completo.
--
-- Nota: solo los reportes que se suban DESPUÉS de aplicar esta migración
-- van a traer este detalle. Los períodos ya subidos antes quedan con
-- detalle_dias vacío — hay que volver a subir esos archivos si se quiere
-- el detalle también para esos meses.
-- =========================================================

alter table asistencia_mensual
  add column if not exists detalle_dias jsonb not null default '[]'::jsonb;
