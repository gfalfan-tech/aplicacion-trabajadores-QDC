-- =========================================================
-- Rol 'caja_chica': permite que RR.HH. le dé acceso a Caja Chica a un
-- trabajador común (sin ser jefatura), igual que 'rendicion_gastos' o
-- 'publicar_mural'. Quien lo tiene puede SOLICITAR fondos y RENDIR sus
-- propios gastos; solo ve sus propias solicitudes (no las de otros ni el
-- saldo del fondo). Aprobar, entregar, confirmar y cerrar la caja siguen
-- siendo de jefatura / RR.HH. como hasta ahora.
--
-- Ejecutar en el SQL Editor de Supabase. Es un solo paso: no hay políticas
-- que usen el valor nuevo (todo el acceso a caja chica pasa por las rutas
-- /api/caja-chica/*). Seguro de re-ejecutar.
-- =========================================================

alter type rol_tipo add value if not exists 'caja_chica';
