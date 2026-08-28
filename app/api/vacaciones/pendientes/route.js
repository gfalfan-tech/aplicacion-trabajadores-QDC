import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Devuelve TODAS las solicitudes de vacaciones que le corresponde revisar
// a quien llama, sin importar el mes en que caigan las fechas — el
// calendario de /api/vacaciones/calendario sí se filtra por mes (para
// pintar el mes que se está mirando), pero eso hacía que una solicitud
// pendiente para, por ejemplo, el mes siguiente no apareciera en
// "VACACIONES PENDIENTES DE TU EQUIPO" mientras se estaba viendo el mes
// actual. Mismo patrón que /api/permisos/pendientes.
//
// Con la doble aprobación, "le corresponde revisar" significa distinto
// según quién pregunta:
//   - Jefatura: solo sus solicitudes en 'pendiente' (su propio equipo). Una
//     vez que el jefe aprueba, la solicitud sale de su lista — ya no tiene
//     nada más que hacer ahí.
//   - RR.HH./administrador: de toda la empresa, las que están en
//     'pendiente' SIN jefe directo válido (ahí RR.HH. es la única
//     aprobación, como antes) MÁS las que están en 'aprobada_jefe' (la
//     segunda firma). Se devuelven juntas — el front las separa en dos
//     secciones usando el campo "estado" de cada una.
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

  if (!esRRHH) {
    // Jefatura: solo lo suyo, en 'pendiente'.
    const { data: trabajadores } = await admin
      .from('trabajadores')
      .select('id, nombre_completo')
      .eq('jefe_directo_id', callerId);
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

  // RR.HH./administrador: toda la empresa.
  const { data: trabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, jefe_directo_id');
  if (!trabajadores || trabajadores.length === 0) {
    return NextResponse.json({ solicitudes: [] });
  }
  const nombrePorTrabajador = new Map(trabajadores.map((t) => [t.id, t.nombre_completo]));

  // Quiénes son jefes directos de alguien, y si ese jefe tiene un rol que
  // lo habilita para aprobar (jefatura/rrhh/administrador) — mismo criterio
  // que usa la Edge Function notificar-revision para decidir a quién avisar.
  const idsJefes = [...new Set(trabajadores.map((t) => t.jefe_directo_id).filter(Boolean))];
  let jefesValidos = new Set();
  if (idsJefes.length > 0) {
    const { data: rolesJefes } = await admin
      .from('trabajador_roles')
      .select('trabajador_id, rol')
      .in('trabajador_id', idsJefes)
      .in('rol', ['jefatura', 'rrhh', 'administrador']);
    jefesValidos = new Set((rolesJefes || []).map((r) => r.trabajador_id));
  }
  const idsSinJefeValido = trabajadores
    .filter((t) => !t.jefe_directo_id || !jefesValidos.has(t.jefe_directo_id))
    .map((t) => t.id);

  const idsTodos = trabajadores.map((t) => t.id);

  const [{ data: pendientesSinJefe }, { data: enSegundaFirma }] = await Promise.all([
    idsSinJefeValido.length > 0
      ? admin
          .from('solicitudes_vacaciones')
          .select('*')
          .in('trabajador_id', idsSinJefeValido)
          .eq('estado', 'pendiente')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin
      .from('solicitudes_vacaciones')
      .select('*')
      .in('trabajador_id', idsTodos)
      .eq('estado', 'aprobada_jefe')
      .order('fecha_aprobacion_jefe', { ascending: false }),
  ]);

  const conNombre = (lista) =>
    (lista || []).map((s) => ({ ...s, trabajador_nombre: nombrePorTrabajador.get(s.trabajador_id) || '—' }));

  return NextResponse.json({
    solicitudes: [...conNombre(enSegundaFirma), ...conNombre(pendientesSinJefe)],
  });
}
