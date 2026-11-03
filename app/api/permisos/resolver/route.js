import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Aprueba o rechaza una solicitud de permiso, con doble aprobación igual
// que vacaciones (/api/vacaciones/resolver): si el trabajador tiene jefe
// directo válido, primero lo resuelve él ('pendiente' -> 'aprobada_jefe')
// y luego RR.HH./administrador da la firma final. Sin jefe válido, RR.HH.
// resuelve en una sola etapa. aprobado_por / fecha_resolucion son siempre
// la decisión final; aprobado_por_jefe / fecha_aprobacion_jefe, la primera.
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
    .from('solicitudes_permiso')
    .select('id, trabajador_id, estado')
    .eq('id', solicitudId)
    .maybeSingle();
  if (!solicitud) {
    return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  }
  if (solicitud.estado !== 'pendiente' && solicitud.estado !== 'aprobada_jefe') {
    return NextResponse.json({ error: 'Esta solicitud ya fue resuelta.' }, { status: 409 });
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

  let tieneJefeValido = false;
  if (trabajador?.jefe_directo_id) {
    const { data: rolesJefe } = await admin
      .from('trabajador_roles')
      .select('rol')
      .eq('trabajador_id', trabajador.jefe_directo_id);
    tieneJefeValido = (rolesJefe || []).some((r) =>
      ['jefatura', 'rrhh', 'administrador'].includes(r.rol)
    );
  }

  const ahora = new Date().toISOString();
  const TEXTO_RECHAZO = 'Favor dirigirse personalmente con su jefatura.';

  async function avisar(cuerpo) {
    await admin.from('notificaciones').insert({
      trabajador_id: solicitud.trabajador_id,
      titulo: 'Solicitud de permiso',
      cuerpo,
      relacionado_tipo: 'solicitud_permiso',
      relacionado_id: solicitudId,
    });
  }

  async function actualizar(cambios) {
    const { error } = await admin.from('solicitudes_permiso').update(cambios).eq('id', solicitudId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return null;
  }

  // Decisión final (aprobación/rechazo): la toma RR.HH. en la segunda
  // firma, o es la única decisión cuando no hay jefe directo válido.
  async function decisionFinal() {
    const cambios =
      estado === 'aprobada'
        ? { estado: 'aprobada', aprobado_por: callerId, fecha_resolucion: ahora, comentario_resolucion: null }
        : { estado: 'rechazada', aprobado_por: callerId, fecha_resolucion: ahora, comentario_resolucion: TEXTO_RECHAZO };
    const fallo = await actualizar(cambios);
    if (fallo) return fallo;
    await avisar(
      estado === 'aprobada'
        ? 'Tu solicitud de permiso fue aprobada.'
        : `Tu solicitud de permiso no fue autorizada. ${TEXTO_RECHAZO}`
    );
    return NextResponse.json({ ok: true });
  }

  // Segunda etapa: ya la aprobó el jefe directo, solo falta RR.HH.
  if (solicitud.estado === 'aprobada_jefe') {
    if (!esRRHH) {
      return NextResponse.json(
        { error: 'Este permiso ya lo aprobó tu jefe directo y ahora está a la espera de RR.HH.' },
        { status: 403 }
      );
    }
    return decisionFinal();
  }

  // Primera etapa (estado === 'pendiente').
  if (tieneJefeValido) {
    // Con jefe directo válido, solo él resuelve la primera etapa; RR.HH.
    // recién actúa cuando queda en 'aprobada_jefe'.
    if (!esJefeDeEsePuesto) {
      return NextResponse.json(
        { error: 'Este permiso debe resolverlo primero el jefe directo de la persona.' },
        { status: 403 }
      );
    }

    if (estado === 'aprobada') {
      const fallo = await actualizar({
        estado: 'aprobada_jefe',
        aprobado_por_jefe: callerId,
        fecha_aprobacion_jefe: ahora,
      });
      if (fallo) return fallo;
      await avisar('Tu jefe directo aprobó tu solicitud de permiso. Ahora está a la espera de la firma de RR.HH.');
      return NextResponse.json({ ok: true });
    }

    // Rechazo del jefe directo: termina el flujo, no llega a RR.HH.
    return decisionFinal();
  }

  // Sin jefe directo válido: aprobación única de RR.HH.
  if (!esRRHH) {
    return NextResponse.json({ error: 'No tienes permiso para resolver esta solicitud.' }, { status: 403 });
  }
  return decisionFinal();
}
