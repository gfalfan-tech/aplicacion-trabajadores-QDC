import { createClient } from '@supabase/supabase-js';

// Helper compartido para las rutas de API: crea el cliente con la llave de
// servicio y valida el token Bearer del que llama. Devuelve
// { admin, user, roles } o null si no está autenticado (ya con la
// respuesta de error puesta en `error`, para que la ruta solo tenga que
// hacer `if (!auth) return auth_error` — ver autenticar()).
export function clienteAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

// Devuelve { admin, user, roles, esRRHH, esJefatura } o lanza un objeto
// { status, error } que la ruta puede devolver directo con NextResponse.json.
export async function autenticar(req) {
  const admin = clienteAdmin();
  if (!admin) {
    throw { status: 500, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' };
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw { status: 401, error: 'No autenticado.' };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) throw { status: 401, error: 'Sesión inválida o expirada.' };

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', userData.user.id);
  const roles = (rolesData || []).map((r) => r.rol);
  const esRRHH = roles.includes('rrhh') || roles.includes('administrador');
  const esJefatura = roles.includes('jefatura');

  return { admin, user: userData.user, roles, esRRHH, esJefatura };
}
