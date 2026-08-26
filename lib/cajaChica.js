'use client';

import { supabase } from '@/lib/supabaseClient';
import { sanitizeFileName } from '@/lib/sanitizeFileName';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

async function llamar(url, opciones = {}) {
  const resp = await fetch(url, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
      ...(opciones.headers || {}),
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || 'Ocurrió un error.');
  return json;
}

export function obtenerEstadoCajaChica() {
  return llamar('/api/caja-chica/estado');
}

export function crearSolicitudCajaChica(datos) {
  return llamar('/api/caja-chica/solicitudes', { method: 'POST', body: JSON.stringify(datos) });
}

export function resolverSolicitudCajaChica(id, accion, extra = {}) {
  return llamar(`/api/caja-chica/solicitudes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ accion, ...extra }),
  });
}

export function enviarRendicionCajaChica(solicitudId, comprobantes) {
  return llamar('/api/caja-chica/rendicion', {
    method: 'POST',
    body: JSON.stringify({ solicitud_id: solicitudId, comprobantes }),
  });
}

export function obtenerReporteCajaChica() {
  return llamar('/api/caja-chica/periodo?reporte=1');
}

export function recargarCajaChica(monto, notas) {
  return llamar('/api/caja-chica/periodo', { method: 'POST', body: JSON.stringify({ monto, notas }) });
}

export function obtenerTrabajadoresYAprobadoresRespaldo() {
  return llamar('/api/caja-chica/aprobadores');
}

export function agregarAprobadorRespaldo(trabajadorId) {
  return llamar('/api/caja-chica/aprobadores', {
    method: 'POST',
    body: JSON.stringify({ trabajador_id: trabajadorId }),
  });
}

export function quitarAprobadorRespaldo(trabajadorId) {
  return llamar('/api/caja-chica/aprobadores', {
    method: 'DELETE',
    body: JSON.stringify({ trabajador_id: trabajadorId }),
  });
}

// Sube el archivo de un comprobante (foto o PDF de factura/boleta/vale
// por) al bucket privado "caja-chica" y devuelve la ruta guardada (no es
// una URL pública — se necesita una URL firmada para verlo después).
export async function subirComprobanteCajaChica(trabajadorId, solicitudId, file) {
  const path = `${trabajadorId}/${solicitudId}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage.from('caja-chica').upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

// URL firmada (temporal) para ver/descargar un comprobante ya subido.
export async function urlFirmadaComprobante(storagePath) {
  const { data, error } = await supabase.storage.from('caja-chica').createSignedUrl(storagePath, 120);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
