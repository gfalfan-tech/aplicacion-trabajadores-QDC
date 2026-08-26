import { supabase } from '@/lib/supabaseClient';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

export async function obtenerPermisosPendientesEquipo() {
  const resp = await fetch('/api/permisos/pendientes', {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo cargar las solicitudes de permiso.');
  return json.solicitudes;
}

export async function resolverSolicitudPermiso(solicitudId, estado) {
  const resp = await fetch('/api/permisos/resolver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ solicitudId, estado }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo resolver la solicitud.');
  return json;
}
