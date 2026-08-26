import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Devuelve TODAS las solicitudes de vacaciones pendientes que le
// corresponde revisar a quien llama (jefe directo o RR.HH.), sin importar
// el mes en que caigan las fechas — el calendario de /api/vacaciones/
// calendario sí se filtra por mes (para pintar el mes que se está
// mirando), pero eso hacía que una solicitud pendiente para, por ejemplo,
// el mes siguiente no apareciera en "VACACIONES PENDIENTES DE TU EQUIPO"
// mientras se estaba viendo el mes actual. Mismo patrón que
// /api/permisos/pendientes.
export async function GET(req) {
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
  const callerId = userData.user.id;

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', callerId);
  const esRRHH = (rolesData || []).some((r) => r.rol === 'rrhh' || r.rol === 'administrador');
  const esJefatura = (rolesData || []).some((r) => r.rol === 'jefatura');

  if (!esRRHH && !esJefatura) {
    return NextResponse.json(
      { error: 'No tienes permiso para ver solicitudes de vacaciones.' },
      { status: 403 }
    );
  }

  let queryTrabajadores = admin.from('trabajadores').select('id, nombre_completo');
  if (!esRRHH) {
    queryTrabajadores = queryTrabajadores.eq('jefe_directo_id', callerId);
  }
  const { data: trabajadores } = await queryTrabajadores;
  const idsTrabajadores = (trabajadores || []).map((t) => t.id);

  if (idsTrabajadores.length === 0) {
    return NextResponse.json({ solicitudes: [] });
  }

  const { data: solicitudes } = await admin
    .from('solicitudes_vacaciones')
    .select('*')
    .in('trabajador_id', idsTrabajadores)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  const nombrePorTrabajador = new Map((trabajadores || []).map((t) => [t.id, t.nombre_completo]));
  const conNombre = (solicitudes || []).map((s) => ({
    ...s,
    trabajador_nombre: nombrePorTrabajador.get(s.trabajador_id) || '—',
  }));

  return NextResponse.json({ solicitudes: conNombre });
}
