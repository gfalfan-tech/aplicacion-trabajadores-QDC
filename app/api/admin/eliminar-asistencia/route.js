import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Elimina todos los registros de asistencia_mensual de un período específico
// (por ejemplo, cuando el archivo subido traía el rango de fechas equivocado).
// Solo RR.HH./administrador puede usar esto.
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' },
      { status: 500 }
    );
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 });
  }

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', userData.user.id);
  const esRRHH = (rolesData || []).some((r) => r.rol === 'rrhh' || r.rol === 'administrador');
  if (!esRRHH) {
    return NextResponse.json({ error: 'No tienes permiso para eliminar asistencia.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { periodo_desde, periodo_hasta } = body || {};
  if (!periodo_desde || !periodo_hasta) {
    return NextResponse.json({ error: 'Falta el período a eliminar.' }, { status: 400 });
  }

  const { error, count } = await admin
    .from('asistencia_mensual')
    .delete({ count: 'exact' })
    .eq('periodo_desde', periodo_desde)
    .eq('periodo_hasta', periodo_hasta);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eliminados: count ?? 0 });
}
