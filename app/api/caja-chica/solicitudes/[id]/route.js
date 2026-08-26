import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { resolverAprobadorEsperado, puedeAprobar } from '@/lib/cajaChicaLogica';

// Aplica una acción sobre una solicitud de caja chica: aprobar, rechazar,
// entregar (el dinero, físicamente) o confirmar_rendicion (el ajuste
// físico de vuelto/saldo deudor ya se hizo). Cada acción valida el estado
// actual y quién tiene permiso para hacerla.
export async function PATCH(req, { params }) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH } = auth;

  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const accion = body?.accion;

  const { data: solicitud } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!solicitud) {
    return NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 });
  }

  if (accion === 'aprobar' || accion === 'rechazar') {
    if (solicitud.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Esta solicitud ya fue resuelta.' }, { status: 400 });
    }

    const { data: solicitante } = await admin
      .from('trabajadores')
      .select('id, nombre_completo, jefe_directo_id')
      .eq('id', solicitud.solicitante_id)
      .single();
    const { data: rolesData } = await admin.from('trabajador_roles').select('trabajador_id, rol');
    const rolesPorTrabajador = new Map();
    (rolesData || []).forEach((r) => {
      const lista = rolesPorTrabajador.get(r.trabajador_id) || [];
      lista.push(r.rol);
      rolesPorTrabajador.set(r.trabajador_id, lista);
    });
    const aprobadorEsperadoId = resolverAprobadorEsperado(solicitante, rolesPorTrabajador);
    const { data: respaldoData } = await admin
      .from('caja_chica_aprobadores_respaldo')
      .select('trabajador_id');
    const aprobadoresRespaldoIds = (respaldoData || []).map((r) => r.trabajador_id);

    const autorizado = puedeAprobar({
      callerId: user.id,
      callerEsRRHH: esRRHH,
      aprobadorEsperadoId,
      aprobadoresRespaldoIds,
    });
    if (!autorizado) {
      return NextResponse.json({ error: 'No te corresponde aprobar esta solicitud.' }, { status: 403 });
    }

    const estado = accion === 'aprobar' ? 'aprobada' : 'rechazada';
    const motivoRechazo = accion === 'rechazar' ? (body?.motivo || '').trim() || null : null;

    const { error } = await admin
      .from('caja_chica_solicitudes')
      .update({
        estado,
        aprobador_id: user.id,
        fecha_resolucion: new Date().toISOString(),
        motivo_rechazo: motivoRechazo,
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('notificaciones').insert({
      trabajador_id: solicitud.solicitante_id,
      titulo: 'Solicitud de caja chica',
      cuerpo:
        accion === 'aprobar'
          ? `Tu solicitud de $${Number(solicitud.monto_solicitado).toLocaleString('es-CL')} fue aprobada.`
          : `Tu solicitud de $${Number(solicitud.monto_solicitado).toLocaleString('es-CL')} fue rechazada${motivoRechazo ? `: ${motivoRechazo}` : '.'}`,
      relacionado_tipo: 'caja_chica_solicitud',
      relacionado_id: id,
    });

    return NextResponse.json({ ok: true });
  }

  if (accion === 'entregar') {
    if (!esRRHH) {
      return NextResponse.json({ error: 'Solo RR.HH./administrador puede marcar la entrega del dinero.' }, { status: 403 });
    }
    if (solicitud.estado !== 'aprobada') {
      return NextResponse.json({ error: 'La solicitud debe estar aprobada para entregar el dinero.' }, { status: 400 });
    }

    const { error } = await admin
      .from('caja_chica_solicitudes')
      .update({ estado: 'entregada', entregado_por: user.id, fecha_entrega: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('notificaciones').insert({
      trabajador_id: solicitud.solicitante_id,
      titulo: 'Caja chica: dinero entregado',
      cuerpo: `Se te entregó $${Number(solicitud.monto_solicitado).toLocaleString('es-CL')} para "${solicitud.articulo}". No olvides hacer tu rendición con los comprobantes.`,
      relacionado_tipo: 'caja_chica_solicitud',
      relacionado_id: id,
    });

    return NextResponse.json({ ok: true });
  }

  if (accion === 'confirmar_rendicion') {
    if (!esRRHH) {
      return NextResponse.json({ error: 'Solo RR.HH./administrador puede confirmar la rendición.' }, { status: 403 });
    }
    if (solicitud.estado !== 'rendicion_ingresada') {
      return NextResponse.json({ error: 'Esta solicitud no tiene una rendición pendiente de confirmar.' }, { status: 400 });
    }

    const { error } = await admin
      .from('caja_chica_solicitudes')
      .update({
        estado: 'rendida',
        rendicion_confirmada_por: user.id,
        fecha_confirmacion: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('notificaciones').insert({
      trabajador_id: solicitud.solicitante_id,
      titulo: 'Caja chica: rendición confirmada',
      cuerpo: `Tu rendición de "${solicitud.articulo}" quedó confirmada.`,
      relacionado_tipo: 'caja_chica_solicitud',
      relacionado_id: id,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
}
