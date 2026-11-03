import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

const TABLAS = { permiso: 'solicitudes_permiso', vacaciones: 'solicitudes_vacaciones' };

// Avisa al trabajador (campanita + push + correo) que su papeleta ya está
// lista para que pase a firmarla. Solo para solicitudes aprobadas que aún no
// están formalizadas.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.puedeFormalizar) {
    return NextResponse.json({ error: 'No tienes permiso para notificar papeletas.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tabla = TABLAS[body?.tipo];
  const id = body?.id;
  if (!tabla || !id) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });

  const { data: solicitud } = await auth.admin
    .from(tabla)
    .select('id, trabajador_id, estado, formalizada_at, fecha_desde, fecha_hasta')
    .eq('id', id)
    .maybeSingle();
  if (!solicitud) return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  if (solicitud.estado !== 'aprobada' || solicitud.formalizada_at) {
    return NextResponse.json({ error: 'Esta papeleta ya no está pendiente de firma.' }, { status: 409 });
  }

  const cosa = body.tipo === 'vacaciones' ? 'vacaciones' : 'permiso';
  const rango =
    solicitud.fecha_desde === solicitud.fecha_hasta
      ? `del ${solicitud.fecha_desde}`
      : `del ${solicitud.fecha_desde} al ${solicitud.fecha_hasta}`;

  const { error } = await auth.admin.from('notificaciones').insert({
    trabajador_id: solicitud.trabajador_id,
    titulo: 'Papeleta lista para firmar',
    cuerpo: `Tu ${cosa} ${rango} fue aprobado. Pasa a firmar tu papeleta con RR.HH.`,
    relacionado_tipo: body.tipo === 'vacaciones' ? 'papeleta_firma_vacaciones' : 'papeleta_firma_permiso',
    relacionado_id: id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
