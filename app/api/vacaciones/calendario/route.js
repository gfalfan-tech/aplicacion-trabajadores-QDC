import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Devuelve, para el mes pedido, las vacaciones aprobadas y pendientes de un
// grupo de trabajadores (el equipo de una jefatura, o toda la empresa /una
// área para RR.HH.), junto con sus días de vacaciones disponibles — para
// pintar el calendario de "quién está de vacaciones cuándo".
export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get('mes'); // 'YYYY-MM'
  const areaId = searchParams.get('area_id') || null;
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Falta el parámetro "mes" (YYYY-MM).' }, { status: 400 });
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
      { error: 'No tienes permiso para ver el calendario de vacaciones.' },
      { status: 403 }
    );
  }

  let queryTrabajadores = admin
    .from('trabajadores')
    .select('id, nombre_completo, avatar_url, area_id, areas(nombre)')
    .eq('estado', 'activo');

  if (esRRHH) {
    if (areaId) queryTrabajadores = queryTrabajadores.eq('area_id', areaId);
  } else {
    // Jefatura: solo su equipo directo.
    queryTrabajadores = queryTrabajadores.eq('jefe_directo_id', callerId);
  }

  const { data: trabajadores } = await queryTrabajadores.order('nombre_completo');
  const idsTrabajadores = (trabajadores || []).map((t) => t.id);

  if (idsTrabajadores.length === 0) {
    return NextResponse.json({ trabajadores: [], solicitudes: [], areas: [] });
  }

  const primerDia = `${mes}-01`;
  const [anio, mesNum] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, mesNum, 0)).toISOString().slice(0, 10);

  const [{ data: solicitudes }, { data: saldos }, { data: areas }] = await Promise.all([
    admin
      .from('solicitudes_vacaciones')
      .select('id, trabajador_id, fecha_desde, fecha_hasta, dias_habiles, estado')
      .in('trabajador_id', idsTrabajadores)
      // 'aprobada_jefe' se pinta igual que 'pendiente' en el calendario
      // (CalendarioVacaciones solo distingue "aprobada" de todo el resto).
      .in('estado', ['aprobada', 'aprobada_jefe', 'pendiente'])
      .lte('fecha_desde', ultimoDia)
      .gte('fecha_hasta', primerDia),
    admin.from('v_vacaciones_saldo').select('*').in('trabajador_id', idsTrabajadores),
    esRRHH ? admin.from('areas').select('id, nombre').order('nombre') : Promise.resolve({ data: [] }),
  ]);

  const saldoPorTrabajador = new Map((saldos || []).map((s) => [s.trabajador_id, s]));
  const trabajadoresConSaldo = (trabajadores || []).map((t) => ({
    ...t,
    saldo: saldoPorTrabajador.get(t.id) || null,
  }));

  return NextResponse.json({
    trabajadores: trabajadoresConSaldo,
    solicitudes: solicitudes || [],
    areas: areas || [],
  });
}
