import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Dada una solicitud de vacaciones, busca otras vacaciones (aprobadas o
// pendientes) de gente de la misma área cuyas fechas se crucen con ella —
// para avisar antes de aprobar. Lo usan tanto RR.HH. como la jefatura.
export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const solicitudId = searchParams.get('solicitud_id');
  if (!solicitudId) {
    return NextResponse.json({ error: 'Falta "solicitud_id".' }, { status: 400 });
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
    .select('id, trabajador_id, fecha_desde, fecha_hasta')
    .eq('id', solicitudId)
    .maybeSingle();
  if (!solicitud) {
    return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  }

  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('id, area_id, jefe_directo_id')
    .eq('id', solicitud.trabajador_id)
    .maybeSingle();

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', callerId);
  const esRRHH = (rolesData || []).some((r) => r.rol === 'rrhh' || r.rol === 'administrador');
  const esJefeDeEsePuesto = trabajador?.jefe_directo_id === callerId;

  if (!esRRHH && !esJefeDeEsePuesto) {
    return NextResponse.json({ error: 'No tienes permiso para ver esto.' }, { status: 403 });
  }

  if (!trabajador?.area_id) {
    return NextResponse.json({ traslapes: [] });
  }

  const { data: compañerosArea } = await admin
    .from('trabajadores')
    .select('id')
    .eq('area_id', trabajador.area_id)
    .neq('id', trabajador.id);
  const idsCompañeros = (compañerosArea || []).map((t) => t.id);
  if (idsCompañeros.length === 0) {
    return NextResponse.json({ traslapes: [] });
  }

  const { data: otras } = await admin
    .from('solicitudes_vacaciones')
    .select('id, trabajador_id, fecha_desde, fecha_hasta, estado, trabajadores(nombre_completo)')
    .in('trabajador_id', idsCompañeros)
    .in('estado', ['aprobada', 'pendiente'])
    .lte('fecha_desde', solicitud.fecha_hasta)
    .gte('fecha_hasta', solicitud.fecha_desde);

  const traslapes = (otras || []).map((s) => ({
    nombre_completo: s.trabajadores?.nombre_completo,
    fecha_desde: s.fecha_desde,
    fecha_hasta: s.fecha_hasta,
    estado: s.estado,
  }));

  return NextResponse.json({ traslapes });
}
