import { supabase } from '@/lib/supabaseClient';

export async function obtenerResumenPendientes() {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion?.session?.access_token;
  const resp = await fetch('/api/pendientes/resumen', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return { certificados: 0, vacaciones: 0, permisos: 0, cajaChica: 0 };
  return resp.json();
}
