-- RUT del proveedor en los comprobantes de caja chica (solo se pide en
-- facturas). Los comprobantes ya rendidos quedan con rut_proveedor = null
-- y el PDF los muestra con "—".
alter table caja_chica_comprobantes
  add column if not exists rut_proveedor text;

-- Nombre / razón social del proveedor (solo facturas).
alter table caja_chica_comprobantes
  add column if not exists proveedor text;
