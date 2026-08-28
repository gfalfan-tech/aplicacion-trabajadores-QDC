-- =========================================================
-- Paso 1 de 2 para Rendición de Gastos. Ejecutar ESTE archivo primero, en
-- una corrida separada — recién cuando termine (sin error), ejecutar
-- rendicion_gastos.sql completo.
--
-- Agrega 'rendicion_gastos' como valor nuevo del enum rol_tipo (el rol
-- de acceso al módulo, igual que jefatura/rrhh/administrador). Postgres
-- exige que un valor de enum recién agregado quede confirmado en su
-- propia transacción antes de poder usarse en cualquier política o
-- consulta — por eso va en un archivo aparte y no junto con el resto.
-- =========================================================

alter type rol_tipo add value if not exists 'rendicion_gastos';
