-- =========================================================
-- Respaldos: carpeta (solo para el rol "administrador") con los
-- documentos ya cerrados de Permisos, Vacaciones, Caja Chica y
-- Rendición de Gastos, organizados por tipo → trabajador → mes.
--
-- No se guarda ninguna copia de archivo nueva — los PDFs se arman al
-- momento con el mismo código que ya usa cada módulo (ver
-- app/api/respaldos/*.js y lib/respaldosServidor.js). Lo único nuevo
-- acá es esta columna, para saber desde cuándo hay que avisarle a
-- cada administrador que hay documentos nuevos (el numerito que se ve
-- sobre el ícono "Respaldos" del menú).
-- =========================================================

alter table trabajadores add column if not exists respaldos_vista_en timestamptz;
