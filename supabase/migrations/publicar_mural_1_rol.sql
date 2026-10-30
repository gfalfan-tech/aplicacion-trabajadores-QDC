-- =========================================================
-- Paso 1 de 2 para el permiso "Publicar en el diario mural". Ejecutar ESTE
-- archivo primero, solo, y recién cuando termine sin error ejecutar
-- publicar_mural_2_politicas.sql (Postgres exige que un valor nuevo de enum
-- quede confirmado antes de poder usarse en políticas).
-- =========================================================

alter type rol_tipo add value if not exists 'publicar_mural';
