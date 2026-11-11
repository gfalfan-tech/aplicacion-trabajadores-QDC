-- =========================================================
-- Rendición de Gastos — título de la rendición
-- =========================================================
-- Permite que quien rinde le ponga un nombre a la rendición
-- (ej. "GASTOS VISITA WINOA"). Es obligatorio al ENVIAR (lo valida la
-- pantalla y la ruta /api/rendicion-gastos/enviar), pero la columna
-- admite null para que las rendiciones y borradores que ya existen
-- sigan funcionando y se vean igual que antes.
-- Seguro de re-ejecutar.
-- =========================================================

alter table rendiciones_gastos
  add column if not exists titulo text;

alter table rendiciones_gastos
  drop constraint if exists rendiciones_gastos_titulo_largo;
alter table rendiciones_gastos
  add constraint rendiciones_gastos_titulo_largo
  check (titulo is null or char_length(btrim(titulo)) between 1 and 120);
