import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Permite a RR.HH./administrador cancelar un permiso ya aprobado (por
// ejemplo, si se aprobó por error). Mismo criterio que
// /api/admin/administrar-vacacion: no se borra, pasa a estado "cancelada"
// con el motivo (obligatorio), quién lo hizo y cuándo, y se le avisa al
// trabajador.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.esRRHH) {
    return NextResponse.json({ error: 'No tienes permiso para hacer este cambio.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const solicitudId = body?.solicitudId;
  const motivo = (body?.motivo || '').trim();

  if (!solicitudId) {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json({ error: 'Debes indicar el motivo de la cancelación.' }, { status: 400 });
  }

  const { data: solicitud } = await auth.admin
    .from('solicitudes_permiso')
    .select('id, trabajador_id, estado, fecha_desde, fecha_hasta')
    .eq('id', solicitudId)
    .maybeSingle();
  if (!solicitud) {
    return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  }
  if (solicitud.estado !== 'aprobada') {
    return NextResponse.json(
      { error: 'Solo se pueden cancelar permisos que estén aprobados.' },
      { status: 400 }
    );
  }

  const { error } = await auth.admin
    .from('solicitudes_permiso')
    .update({
      estado: 'cancelada',
      comentario_resolucion: motivo,
      editado_por: auth.user.id,
      editado_en: new Date().toISOString(),
      motivo_edicion: motivo,
    })
    .eq('id', solicitudId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rango =
    solicitud.fecha_desde === solicitud.fecha_hasta
      ? `del ${solicitud.fecha_desde}`
      : `del ${solicitud.fecha_desde} al ${solicitud.fecha_hasta}`;
  await auth.admin.from('notificaciones').insert({
    trabajador_id: solicitud.trabajador_id,
    titulo: 'Tu permiso fue cancelado',
    cuerpo: `RR.HH. canceló tu permiso ${rango}. Motivo: ${motivo}`,
    relacionado_tipo: 'solicitud_permiso_cancelada',
    relacionado_id: solicitudId,
  });

  return NextResponse.json({ ok: true });
}
