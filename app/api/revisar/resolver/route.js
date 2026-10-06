import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enviarCorreo } from '@/lib/enviarCorreo';
import {
  correoCajaChicaResuelta,
  correoRendicionNueva,
  correoRendicionResuelta,
} from '@/lib/plantillasCorreo';

// Resuelve (aprueba o rechaza) una solicitud de caja chica o rendición de
// gastos usando un token de revisión por correo. No requiere autenticación:
// el token ES la autenticación.
//
// POST /api/revisar/resolver
// Body: { tipo: 'caja-chica' | 'rendicion-gastos', token: uuid, accion: 'aprobada' | 'rechazada' }

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { tipo, token, accion } = body;

  if (!token || !['aprobada', 'rechazada'].includes(accion)) {
    return NextResponse.json({ ok: false, mensaje: 'Parámetros inválidos.' }, { status: 400 });
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ ok: false, mensaje: 'Configuración de servidor incompleta.' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  if (tipo === 'caja-chica') {
    return resolverCajaChica(admin, token, accion);
  }

  if (tipo === 'rendicion-gastos') {
    return resolverRendicionGastos(admin, token, accion);
  }

  return NextResponse.json({ ok: false, mensaje: 'Tipo no reconocido.' }, { status: 400 });
}

// =========================================================================
// CAJA CHICA
// =========================================================================
async function resolverCajaChica(admin, token, accion) {
  const { data: solicitud } = await admin
    .from('caja_chica_solicitudes')
    .select('id, solicitante_id, monto_solicitado, articulo, razon, estado, aprobador_id')
    .eq('revision_token', token)
    .gt('revision_token_expira', new Date().toISOString())
    .maybeSingle();

  if (!solicitud) {
    return NextResponse.json({ ok: false, mensaje: 'Este enlace ya no es válido o expiró.' });
  }
  if (solicitud.estado !== 'pendiente') {
    return NextResponse.json({ ok: false, mensaje: 'Esta solicitud ya fue revisada anteriormente.' });
  }

  const estado = accion === 'aprobada' ? 'aprobada' : 'rechazada';
  const motivoRechazo = accion === 'rechazada' ? 'Favor dirigirse personalmente con su jefatura.' : null;

  const { error } = await admin
    .from('caja_chica_solicitudes')
    .update({
      estado,
      fecha_resolucion: new Date().toISOString(),
      motivo_rechazo: motivoRechazo,
      revision_token: null,
      revision_token_expira: null,
    })
    .eq('id', solicitud.id);

  if (error) {
    return NextResponse.json({ ok: false, mensaje: 'Ocurrió un error, intenta de nuevo.' }, { status: 500 });
  }

  // Notificación in-app al solicitante
  await admin.from('notificaciones').insert({
    trabajador_id: solicitud.solicitante_id,
    titulo: 'Solicitud de caja chica',
    cuerpo:
      accion === 'aprobada'
        ? `Tu solicitud de $${Number(solicitud.monto_solicitado).toLocaleString('es-CL')} fue aprobada.`
        : `Tu solicitud de $${Number(solicitud.monto_solicitado).toLocaleString('es-CL')} fue rechazada. ${motivoRechazo}`,
    relacionado_tipo: 'caja_chica_solicitud',
    relacionado_id: solicitud.id,
  });

  // Correo informativo al solicitante
  const { data: solicitante } = await admin
    .from('trabajadores')
    .select('email')
    .eq('id', solicitud.solicitante_id)
    .maybeSingle();

  if (solicitante?.email) {
    const { subject, html } = correoCajaChicaResuelta({
      monto: solicitud.monto_solicitado,
      articulo: solicitud.articulo,
      aprobada: accion === 'aprobada',
      motivoRechazo,
    });
    enviarCorreo({ to: solicitante.email, subject, html }).catch(() => {});
  }

  return NextResponse.json({ ok: true, mensaje: 'Listo, quedó registrado.' });
}

// =========================================================================
// RENDICIÓN DE GASTOS
// =========================================================================
async function resolverRendicionGastos(admin, token, accion) {
  const { data: rendicion } = await admin
    .from('rendiciones_gastos')
    .select('id, trabajador_id, estado, revision_etapa, moneda')
    .eq('revision_token', token)
    .gt('revision_token_expira', new Date().toISOString())
    .maybeSingle();

  if (!rendicion) {
    return NextResponse.json({ ok: false, mensaje: 'Este enlace ya no es válido o expiró.' });
  }

  const estadoActual = rendicion.estado;
  const etapa = rendicion.revision_etapa; // 'jefe' o 'finanzas'

  // Validar que el estado sea coherente con la etapa del token
  if (etapa === 'jefe' && estadoActual !== 'pendiente') {
    return NextResponse.json({ ok: false, mensaje: 'Esta rendición ya fue revisada.' });
  }
  if (etapa === 'finanzas' && estadoActual !== 'aprobada_jefe' && estadoActual !== 'pendiente') {
    return NextResponse.json({ ok: false, mensaje: 'Esta rendición ya fue revisada.' });
  }

  const ahora = new Date().toISOString();
  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('email, nombre_completo')
    .eq('id', rendicion.trabajador_id)
    .maybeSingle();

  if (accion === 'rechazada') {
    // Rechazo en cualquier etapa → fin del flujo
    const { error } = await admin
      .from('rendiciones_gastos')
      .update({
        estado: 'rechazada',
        fecha_resolucion: ahora,
        comentario_resolucion: 'Favor dirigirse personalmente con su jefatura.',
        revision_token: null,
        revision_token_expira: null,
        revision_etapa: null,
      })
      .eq('id', rendicion.id);

    if (error) {
      return NextResponse.json({ ok: false, mensaje: 'Ocurrió un error.' }, { status: 500 });
    }

    await admin.from('notificaciones').insert({
      trabajador_id: rendicion.trabajador_id,
      titulo: 'Rendición de gastos',
      cuerpo: 'Tu rendición de gastos no fue autorizada. Favor dirigirse personalmente con su jefatura.',
      relacionado_tipo: 'rendicion_gastos',
      relacionado_id: rendicion.id,
    });

    if (trabajador?.email) {
      const { subject, html } = correoRendicionResuelta({ estado: 'rechazada' });
      enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
    }

    return NextResponse.json({ ok: true, mensaje: 'Listo, quedó registrado.' });
  }

  // Aprobación
  if (etapa === 'jefe') {
    // Primera etapa: jefe aprueba → pasa a aprobada_jefe, necesita firma de Finanzas
    const { error } = await admin
      .from('rendiciones_gastos')
      .update({
        estado: 'aprobada_jefe',
        aprobado_por_jefe: null, // no tenemos el ID del jefe aquí (fue por token)
        fecha_aprobacion_jefe: ahora,
        revision_token: null,
        revision_token_expira: null,
        revision_etapa: null,
      })
      .eq('id', rendicion.id);

    if (error) {
      return NextResponse.json({ ok: false, mensaje: 'Ocurrió un error.' }, { status: 500 });
    }

    // Notificar al trabajador
    await admin.from('notificaciones').insert({
      trabajador_id: rendicion.trabajador_id,
      titulo: 'Rendición de gastos',
      cuerpo: 'Tu jefe directo aprobó tu rendición de gastos. Ahora está a la espera de la firma de Finanzas.',
      relacionado_tipo: 'rendicion_gastos',
      relacionado_id: rendicion.id,
    });

    if (trabajador?.email) {
      const { subject, html } = correoRendicionResuelta({ estado: 'aprobada_jefe' });
      enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
    }

    // Enviar correo con botones al siguiente revisor (RRHH/Finanzas)
    await enviarCorreoSiguienteEtapa(admin, rendicion.id, trabajador?.nombre_completo || 'Un trabajador', rendicion.moneda);

    return NextResponse.json({ ok: true, mensaje: 'Listo, quedó registrado. Se notificó a Finanzas para la segunda firma.' });
  }

  // etapa === 'finanzas' (o aprobación directa sin jefe)
  const { error } = await admin
    .from('rendiciones_gastos')
    .update({
      estado: 'aprobada',
      fecha_resolucion: ahora,
      revision_token: null,
      revision_token_expira: null,
      revision_etapa: null,
    })
    .eq('id', rendicion.id);

  if (error) {
    return NextResponse.json({ ok: false, mensaje: 'Ocurrió un error.' }, { status: 500 });
  }

  await admin.from('notificaciones').insert({
    trabajador_id: rendicion.trabajador_id,
    titulo: 'Rendición de gastos',
    cuerpo: 'Tu rendición de gastos fue aprobada.',
    relacionado_tipo: 'rendicion_gastos',
    relacionado_id: rendicion.id,
  });

  if (trabajador?.email) {
    const { subject, html } = correoRendicionResuelta({ estado: 'aprobada' });
    enviarCorreo({ to: trabajador.email, subject, html }).catch(() => {});
  }

  return NextResponse.json({ ok: true, mensaje: 'Listo, quedó registrado.' });
}

// -------------------------------------------------------------------------
// Helper: enviar correo con botones a RRHH/Finanzas para la segunda firma
// -------------------------------------------------------------------------
async function enviarCorreoSiguienteEtapa(admin, rendicionId, nombreTrabajador, moneda) {
  // Buscar un RRHH/administrador con email
  const { data: rolesRRHH } = await admin
    .from('trabajador_roles')
    .select('trabajador_id')
    .in('rol', ['rrhh', 'administrador']);

  const idsRRHH = [...new Set((rolesRRHH || []).map((r) => r.trabajador_id))];
  if (idsRRHH.length === 0) return;

  // Buscar el primer RRHH con email
  const { data: revisores } = await admin
    .from('trabajadores')
    .select('id, email')
    .in('id', idsRRHH);

  const revisor = (revisores || []).find((r) => r.email);
  if (!revisor) return;

  // Generar token para segunda etapa
  const { data: nuevoToken } = await admin.rpc('generar_token_revision_rendicion_gastos', {
    p_rendicion_id: rendicionId,
    p_revisor_id: revisor.id,
    p_etapa: 'finanzas',
  });

  if (!nuevoToken) return;

  // Calcular total de líneas
  const { data: lineas } = await admin
    .from('rendicion_gastos_lineas')
    .select('monto')
    .eq('rendicion_id', rendicionId);

  const totalGastos = (lineas || []).reduce((s, l) => s + Number(l.monto || 0), 0);

  const { subject, html } = correoRendicionNueva({
    nombreTrabajador,
    totalGastos,
    moneda,
    etapa: 'finanzas',
    token: nuevoToken,
  });

  await enviarCorreo({ to: revisor.email, subject, html });

  // Notificación in-app a todos los RRHH/admin
  await admin.from('notificaciones').insert(
    idsRRHH.map((id) => ({
      trabajador_id: id,
      titulo: 'Rendición de gastos — segunda firma',
      cuerpo: `${nombreTrabajador} tiene una rendición de gastos aprobada por su jefe. Necesita tu firma de Finanzas.`,
      relacionado_tipo: 'rendicion_gastos',
      relacionado_id: rendicionId,
    }))
  );
}
