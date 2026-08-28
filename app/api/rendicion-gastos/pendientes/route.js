import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Devuelve las rendiciones de gastos que le corresponde revisar a quien
// llama — mismo criterio exacto que /api/vacaciones/pendientes:
//   - Jefatura: solo sus rendiciones en 'pendiente' (su propio equipo).
//   - RR.HH./administrador: de toda la empresa, las 'pendiente' SIN jefe
//     directo válido (ahí es la única aprobación) MÁS las 'aprobada_jefe'
//     (la segunda firma / "Finanzas"). Se devuelven juntas — el front las
//     separa en dos secciones usando el campo "estado".
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
    return NextResponse.json({ error: 'No tienes permiso para ver rendiciones de gastos.' }, { status: 403 });
  }

  if (!esRRHH) {
    const { data: trabajadores } = await admin
      .from('trabajadores')
      .select('id, nombre_completo')
      .eq('jefe_directo_id', callerId);
    const idsTrabajadores = (trabajadores || []).map((t) => t.id);
    if (idsTrabajadores.length === 0) {
      return NextResponse.json({ rendiciones: [] });
    }

    const { data: rendiciones } = await admin
      .from('rendiciones_gastos')
      .select('*')
      .in('trabajador_id', idsTrabajadores)
      .eq('estado', 'pendiente')
      .order('fecha_envio', { ascending: false });

    const nombrePorTrabajador = new Map((trabajadores || []).map((t) => [t.id, t.nombre_completo]));
    const conNombre = (rendiciones || []).map((r) => ({
      ...r,
      trabajador_nombre: nombrePorTrabajador.get(r.trabajador_id) || '—',
    }));

    return NextResponse.json({ rendiciones: conNombre });
  }

  // RR.HH./administrador: toda la empresa.
  const { data: trabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, jefe_directo_id');
  if (!trabajadores || trabajadores.length === 0) {
    return NextResponse.json({ rendiciones: [] });
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
  const idsTodos = trabajadores.map((t) => t.id);

  const [{ data: pendientesSinJefe }, { data: enSegundaFirma }] = await Promise.all([
    idsSinJefeValido.length > 0
      ? admin
          .from('rendiciones_gastos')
          .select('*')
          .in('trabajador_id', idsSinJefeValido)
          .eq('estado', 'pendiente')
          .order('fecha_envio', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin
      .from('rendiciones_gastos')
      .select('*')
      .in('trabajador_id', idsTodos)
      .eq('estado', 'aprobada_jefe')
      .order('fecha_aprobacion_jefe', { ascending: false }),
  ]);

  const conNombre = (lista) =>
    (lista || []).map((r) => ({ ...r, trabajador_nombre: nombrePorTrabajador.get(r.trabajador_id) || '—' }));

  return NextResponse.json({
    rendiciones: [...conNombre(enSegundaFirma), ...conNombre(pendientesSinJefe)],
  });
}
