import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Devuelve las solicitudes de permiso pendientes que le corresponde revisar
// a quien llama. Doble aprobación (igual que /api/vacaciones/pendientes):
// jefatura ve las 'pendiente' de su equipo directo; RR.HH./administrador
// solo ve las que ya aprobó el jefe directo ('aprobada_jefe') más las
// 'pendiente' de trabajadores sin jefe directo válido.
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
      { error: 'No tienes permiso para ver solicitudes de permiso.' },
      { status: 403 }
    );
  }

  const incluirTipo = '*, tipos_permiso(nombre)';

  if (!esRRHH) {
    // Jefatura: solo su equipo directo, en 'pendiente' (una vez que aprueba,
    // el permiso sale de su lista: ya no tiene nada más que hacer).
    const { data: trabajadores } = await admin
      .from('trabajadores')
      .select('id, nombre_completo')
      .eq('jefe_directo_id', callerId);
    const idsTrabajadores = (trabajadores || []).map((t) => t.id);
    if (idsTrabajadores.length === 0) {
      return NextResponse.json({ solicitudes: [] });
    }

    const { data: solicitudes } = await admin
      .from('solicitudes_permiso')
      .select(incluirTipo)
      .in('trabajador_id', idsTrabajadores)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });

    const nombrePorTrabajador = new Map((trabajadores || []).map((t) => [t.id, t.nombre_completo]));
    return NextResponse.json({
      solicitudes: (solicitudes || []).map((s) => ({
        ...s,
        trabajador_nombre: nombrePorTrabajador.get(s.trabajador_id) || '—',
      })),
    });
  }

  // RR.HH./administrador: solo lo que realmente le toca firmar:
  //   - 'aprobada_jefe': el jefe directo ya lo aprobó (segunda firma).
  //   - 'pendiente' de trabajadores SIN jefe directo válido (ahí RR.HH. es la
  //     única aprobación).
  // Los 'pendiente' que todavía dependen del jefe directo NO se muestran.
  const { data: trabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, jefe_directo_id');
  if (!trabajadores || trabajadores.length === 0) {
    return NextResponse.json({ solicitudes: [] });
  }
  const nombrePorTrabajador = new Map(trabajadores.map((t) => [t.id, t.nombre_completo]));

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

  const [{ data: pendientesSinJefe }, { data: enSegundaFirma }] = await Promise.all([
    idsSinJefeValido.length > 0
      ? admin
          .from('solicitudes_permiso')
          .select(incluirTipo)
          .in('trabajador_id', idsSinJefeValido)
          .eq('estado', 'pendiente')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin
      .from('solicitudes_permiso')
      .select(incluirTipo)
      .eq('estado', 'aprobada_jefe')
      .order('fecha_aprobacion_jefe', { ascending: false }),
  ]);

  const conNombre = (lista) =>
    (lista || []).map((s) => ({ ...s, trabajador_nombre: nombrePorTrabajador.get(s.trabajador_id) || '—' }));

  return NextResponse.json({
    solicitudes: [...conNombre(enSegundaFirma), ...conNombre(pendientesSinJefe)],
  });
}
