import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enviarCorreo } from '@/lib/enviarCorreo';
import { correoRendicionResuelta, correoRendicionNueva } from '@/lib/plantillasCorreo';

// Aprueba o rechaza una rendición de gastos. Misma doble aprobación que
// vacaciones (ver app/api/vacaciones/resolver/route.js — este archivo es
// prácticamente un calco, solo cambia la tabla y los textos): si el
// trabajador tiene un jefe directo con acceso al sistema, la rendición
// pasa primero por él — si aprueba, queda en 'aprobada_jefe' a la espera
// de la segunda firma de RR.HH./administrador ("Finanzas" en el PDF), que
// recién ahí la deja 'aprobada' (final) o 'rechazada'. Si el trabajador
// NO tiene jefe directo válido, RR.HH. resuelve directo, en una sola
// etapa.
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = await req.json();
  const { rendicionId, estado } = body;
  if (!rendicionId || (estado !== 'aprobada' && estado !== 'rechazada')) {
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

  const { data: rendicion } = await admin
    .from('rendiciones_gastos')
    .select('id, trabajador_id, estado, moneda')
    .eq('id', rendicionId)
    .maybeSingle();
  if (!rendicion) {
    return NextResponse.json({ error: 'No se encontró esa rendición.' }, { status: 404 });
  }
  if (rendicion.estado !== 'pendiente' && rendicion.estado !== 'aprobada_jefe') {
    return NextResponse.json({ error: 'Esta rendición ya fue resuelta.' }, { status: 409 });
  }

  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('jefe_directo_id, email, nombre_completo')
    .eq('id', rendicion.trabajador_id)
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

  async function notificar(cuerpo) {
    await admin.from('notificaciones').insert({
      trabajador_id: rendicion.trabajador_id,
      titulo: 'Rendición de gastos',
      cuerpo,
      relacionado_tipo: 'rendicion_gastos',
      relacionado_id: rendicionId,
    });
  }

  if (rendicion.estado === 'aprobada_jefe') {
    // Segunda etapa: ya la aprobó el jefe directo, solo falta la firma de
    // Finanzas (RR.HH./administrador — puede ser la misma persona que
    // aprobó como jefe, si tiene ambos roles).
    if (!esRRHH) {
      return NextResponse.json(
        { error: 'Esta rendición ya la aprobó el jefe directo y ahora está a la espera de Finanzas.' },
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

    const { error } = await admin.from('rendiciones_gastos').update(cambios).eq('id', rendicionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await notificar(
      estado === 'aprobada'
        ? 'Tu rendición de gastos fue aprobada.'
        : 'Tu rendición de gastos no fue autorizada. Favor dirigirse personalmente con su jefatura.'
    );

    // Correo informativo al trabajador
    if (trabajador?.email) {
      const { subject, html } = correoRendicionResuelta({ estado });
      enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // Primera etapa (estado === 'pendiente').
  if (tieneJefeValido) {
    if (!esJefeDeEsePuesto) {
      return NextResponse.json(
        { error: 'Esta rendición debe resolverla primero el jefe directo de la persona.' },
        { status: 403 }
      );
    }

    if (estado === 'aprobada') {
      const { error } = await admin
        .from('rendiciones_gastos')
        .update({ estado: 'aprobada_jefe', aprobado_por_jefe: callerId, fecha_aprobacion_jefe: ahora })
        .eq('id', rendicionId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await notificar('Tu jefe directo aprobó tu rendición de gastos. Ahora está a la espera de la firma de Finanzas.');

      // Correo informativo al trabajador
      if (trabajador?.email) {
        const { subject, html } = correoRendicionResuelta({ estado: 'aprobada_jefe' });
        enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
      }

      // Correo con botones al siguiente revisor (RRHH/Finanzas)
      const { data: rolesRRHH } = await admin
        .from('trabajador_roles')
        .select('trabajador_id')
        .in('rol', ['rrhh', 'administrador']);
      const idsRRHH = [...new Set((rolesRRHH || []).map((r) => r.trabajador_id))];
      if (idsRRHH.length > 0) {
        const { data: revisores } = await admin
          .from('trabajadores')
          .select('id, email')
          .in('id', idsRRHH);
        const revisorConEmail = (revisores || []).find((r) => r.email);
        if (revisorConEmail) {
          const { data: tokenFinanzas } = await admin.rpc('generar_token_revision_rendicion_gastos', {
            p_rendicion_id: rendicionId,
            p_revisor_id: revisorConEmail.id,
            p_etapa: 'finanzas',
          });
          if (tokenFinanzas) {
            const { data: lineas } = await admin
              .from('rendicion_gastos_lineas')
              .select('monto')
              .eq('rendicion_id', rendicionId);
            const totalGastos = (lineas || []).reduce((s, l) => s + Number(l.monto || 0), 0);
            const { subject: subj, html: htmlFinanzas } = correoRendicionNueva({
              nombreTrabajador: trabajador?.nombre_completo || 'Un trabajador',
              totalGastos,
              moneda: rendicion.moneda || 'CLP',
              etapa: 'finanzas',
              token: tokenFinanzas,
            });
            enviarCorreo({ to: revisorConEmail.email, subject: subj, html: htmlFinanzas }).catch(() => {});
          }
        }

        // Notificación in-app a todos los RRHH/admin para la segunda firma
        await admin.from('notificaciones').insert(
          idsRRHH.map((id) => ({
            trabajador_id: id,
            titulo: 'Rendición de gastos — segunda firma',
            cuerpo: `${trabajador?.nombre_completo || 'Un trabajador'} tiene una rendición de gastos aprobada por su jefe. Necesita tu firma de Finanzas.`,
            relacionado_tipo: 'rendicion_gastos',
            relacionado_id: rendicionId,
          }))
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Rechazo del jefe directo: termina el flujo ahí mismo, no llega a Finanzas.
    const { error } = await admin
      .from('rendiciones_gastos')
      .update({
        estado: 'rechazada',
        aprobado_por: callerId,
        fecha_resolucion: ahora,
        comentario_resolucion: 'Favor dirigirse personalmente con su jefatura.',
      })
      .eq('id', rendicionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await notificar('Tu rendición de gastos no fue autorizada. Favor dirigirse personalmente con su jefatura.');

    // Correo informativo al trabajador
    if (trabajador?.email) {
      const { subject, html } = correoRendicionResuelta({ estado: 'rechazada' });
      enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // Sin jefe directo válido: aprobación única de Finanzas (RR.HH./administrador), como antes.
  if (!esRRHH) {
    return NextResponse.json({ error: 'No tienes permiso para resolver esta rendición.' }, { status: 403 });
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

  const { error } = await admin.from('rendiciones_gastos').update(cambios).eq('id', rendicionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notificar(
    estado === 'aprobada'
      ? 'Tu rendición de gastos fue aprobada.'
      : 'Tu rendición de gastos no fue autorizada. Favor dirigirse personalmente con su jefatura.'
  );

  // Correo informativo al trabajador
  if (trabajador?.email) {
    const { subject, html } = correoRendicionResuelta({ estado });
    enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
