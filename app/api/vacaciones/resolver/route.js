import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Aprueba o rechaza una solicitud de vacaciones. Antes solo RR.HH. podía
// hacerlo desde el panel; ahora también puede la jefatura directa de la
// persona, para su propio equipo.
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = await req.json();
  const { solicitudId, estado } = body;
  if (!solicitudId || (estado !== 'aprobada' && estado !== 'rechazada')) {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
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
  const callerId = userData.user.id;

  const { data: solicitud } = await admin
    .from('solicitudes_vacaciones')
    .select('id, trabajador_id')
    .eq('id', solicitudId)
    .maybeSingle();
  if (!solicitud) {
    return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  }

  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('jefe_directo_id')
    .eq('id', solicitud.trabajador_id)
    .maybeSingle();

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', callerId);
  const esRRHH = (rolesData || []).some((r) => r.rol === 'rrhh' || r.rol === 'administrador');
  const esJefeDeEsePuesto = trabajador?.jefe_directo_id === callerId;

  if (!esRRHH && !esJefeDeEsePuesto) {
    return NextResponse.json(
      { error: 'No tienes permiso para resolver esta solicitud.' },
      { status: 403 }
    );
  }

  const { error } = await admin
    .from('solicitudes_vacaciones')
    .update({ estado, aprobado_por: callerId, fecha_resolucion: new Date().toISOString() })
    .eq('id', solicitudId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
