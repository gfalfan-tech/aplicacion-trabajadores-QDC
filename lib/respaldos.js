// Llamadas desde el cliente para la carpeta "Respaldos" (solo
// administrador). Todo pasa por rutas de servidor porque caja chica no
// tiene ninguna política RLS que permita leerla directo desde el
// navegador (ver supabase/migrations/caja_chica.sql — RLS está
// habilitado pero sin políticas de SELECT en esa tabla), y porque "solo
// administrador" no es un nivel de acceso que exista en las políticas
// RLS de las otras tablas (ahí siempre es rrhh+administrador juntos).

import { supabase } from '@/lib/supabaseClient';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

export async function obtenerResumenRespaldos() {
  const resp = await fetch('/api/respaldos/resumen', {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo cargar Respaldos.');
  return json;
}

export async function obtenerContadorRespaldos() {
  const t = await token();
  if (!t) return 0;
  const resp = await fetch('/api/respaldos/contador', { headers: { Authorization: `Bearer ${t}` } });
  if (!resp.ok) return 0;
  const json = await resp.json().catch(() => ({}));
  return json.nuevos || 0;
}
