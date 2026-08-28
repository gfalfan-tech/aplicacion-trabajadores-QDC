import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Aprueba o rechaza una solicitud de vacaciones.
//
// Doble aprobación: si el trabajador tiene un jefe directo con acceso al
// sistema (rol jefatura/rrhh/administrador), la solicitud pasa primero por
// él — si aprueba, queda en 'aprobada_jefe' a la espera de una segunda
// firma de RR.HH./administrador, que recién ahí la deja 'aprobada' (final)
// o 'rechazada'. Si el trabajador NO tiene jefe directo válido, sigue como
// antes: RR.HH. resuelve directo, en una sola etapa.
//
// aprobado_por / fecha_resolucion / comentario_resolucion representan
// siempre la decisión FINAL (la de RR.HH. cuando hay doble aprobación, la
// única decisión cuando no la hay, o el rechazo del jefe cuando rechaza en
// la primera etapa — ahí también termina el flujo). aprobado_por_jefe /
// fecha_aprobacion_jefe registran solo la primera firma.
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
    .select('id, trabajador_id, estado, fecha_desde, fecha_hasta')
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

  if (solicitud.estado === 'aprobada_jefe') {
    // Segunda etapa: ya la aprobó el jefe directo, solo falta la firma de
    // RR.HH./administrador (puede ser la misma persona que aprobó como
    // jefe, si tiene ambos roles).
    if (!esRRHH) {
      return NextResponse.json(
        { error: 'Esta solicitud ya la aprobó tu jefe directo y ahora está a la espera de RR.HH.' },
        { status: 403 }
      );
    }

    const cambios =
      estado === 'aprobada'
        ? { estado: 'aprobada', aprobado_por: callerId, fecha_resolucion: ahora }
        : {
            estado: 'rechazada',
            aprobado_por: callerId,
            fecha_resolucion: ahora,
            comentario_resolucion: 'Favor dirigirse personalmente con su jefatura.',
          };

    const { error } = await admin.from('solicitudes_vacaciones').update(cambios).eq('id', solicitudId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.from('notificaciones').insert({
      trabajador_id: solicitud.trabajador_id,
      titulo: 'Solicitud de vacaciones',
      cuerpo:
        estado === 'aprobada'
          ? 'Tu solicitud de vacaciones fue aprobada.'
          : 'Tu solicitud de vacaciones no fue autorizada. Favor dirigirse personalmente con su jefatura.',
      relacionado_tipo: 'solicitud_vacaciones',
      relacionado_id: solicitudId,
    });

    return NextResponse.json({ ok: true });
  }

  // Primera etapa (estado === 'pendiente').
  if (tieneJefeValido) {
    // Con jefe directo válido, solo él puede resolver esta primera etapa —
    // RR.HH. recién puede actuar cuando quede en 'aprobada_jefe', para que
    // la doble firma sea real (dos personas distintas tienen que decir que
    // sí, salvo que la misma persona tenga ambos roles).
    if (!esJefeDeEsePuesto) {
      return NextResponse.json(
        { error: 'Esta solicitud debe resolverla primero el jefe directo de la persona.' },
        { status: 403 }
      );
    }

    if (estado === 'aprobada') {
      const { error } = await admin
        .from('solicitudes_vacaciones')
        .update({ estado: 'aprobada_jefe', aprobado_por_jefe: callerId, fecha_aprobacion_jefe: ahora })
        .eq('id', solicitudId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await admin.from('notificaciones').insert({
        trabajador_id: solicitud.trabajador_id,
        titulo: 'Solicitud de vacaciones',
        cuerpo: 'Tu jefe directo aprobó tu solicitud de vacaciones. Ahora está a la espera de la firma de RR.HH.',
        relacionado_tipo: 'solicitud_vacaciones',
        relacionado_id: solicitudId,
      });

      return NextResponse.json({ ok: true });
    }

    // Rechazo del jefe directo: termina el flujo ahí mismo, no llega a RR.HH.
    const { error } = await admin
      .from('solicitudes_vacaciones')
      .update({
        estado: 'rechazada',
        aprobado_por: callerId,
        fecha_resolucion: ahora,
        comentario_resolucion: 'Favor dirigirse personalmente con su jefatura.',
      })
      .eq('id', solicitudId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.from('notificaciones').insert({
      trabajador_id: solicitud.trabajador_id,
      titulo: 'Solicitud de vacaciones',
      cuerpo: 'Tu solicitud de vacaciones no fue autorizada. Favor dirigirse personalmente con su jefatura.',
      relacionado_tipo: 'solicitud_vacaciones',
      relacionado_id: solicitudId,
    });

    return NextResponse.json({ ok: true });
  }

  // Sin jefe directo válido: aprobación única de RR.HH., como antes.
  if (!esRRHH) {
    return NextResponse.json(
      { error: 'No tienes permiso para resolver esta solicitud.' },
      { status: 403 }
    );
  }

  const cambios =
    estado === 'aprobada'
      ? { estado: 'aprobada', aprobado_por: callerId, fecha_resolucion: ahora }
      : {
          estado: 'rechazada',
          aprobado_por: callerId,
          fecha_resolucion: ahora,
          comentario_resolucion: 'Favor dirigirse personalmente con su jefatura.',
        };

  const { error } = await admin.from('solicitudes_vacaciones').update(cambios).eq('id', solicitudId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from('notificaciones').insert({
    trabajador_id: solicitud.trabajador_id,
    titulo: 'Solicitud de vacaciones',
    cuerpo:
      estado === 'aprobada'
        ? 'Tu solicitud de vacaciones fue aprobada.'
        : 'Tu solicitud de vacaciones no fue autorizada. Favor dirigirse personalmente con su jefatura.',
    relacionado_tipo: 'solicitud_vacaciones',
    relacionado_id: solicitudId,
  });

  return NextResponse.json({ ok: true });
}
