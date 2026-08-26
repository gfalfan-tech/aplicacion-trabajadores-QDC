import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// El solicitante ingresa los comprobantes (factura/boleta/vale por) con
// los que justifica el gasto de una solicitud ya entregada. Calcula el
// monto rendido y deja la solicitud a la espera de que RR.HH./
// administrador confirme el ajuste físico (vuelto o saldo deudor).
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH } = auth;

  const body = await req.json().catch(() => ({}));
  const solicitudId = body?.solicitud_id;
  const comprobantes = Array.isArray(body?.comprobantes) ? body.comprobantes : [];

  if (!solicitudId || comprobantes.length === 0) {
    return NextResponse.json({ error: 'Falta indicar al menos un comprobante.' }, { status: 400 });
  }

  const { data: solicitud } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();

  if (!solicitud) {
    return NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 });
  }
  if (solicitud.solicitante_id !== user.id && !esRRHH) {
    return NextResponse.json({ error: 'Solo quien solicitó puede ingresar su rendición.' }, { status: 403 });
  }
  if (solicitud.estado !== 'entregada') {
    return NextResponse.json(
      { error: 'Esta solicitud no está en un estado que permita rendir cuentas (¿ya se rindió o aún no se entrega el dinero?).' },
      { status: 400 }
    );
  }

  const TIPOS_VALIDOS = new Set(['factura', 'boleta', 'vale_por']);
  let montoRendido = 0;
  for (const c of comprobantes) {
    const monto = Number(c.monto);
    if (!TIPOS_VALIDOS.has(c.tipo) || !monto || monto <= 0) {
      return NextResponse.json({ error: 'Uno de los comprobantes tiene datos inválidos.' }, { status: 400 });
    }
    montoRendido += monto;
  }

  const { error: errorComprobantes } = await admin.from('caja_chica_comprobantes').insert(
    comprobantes.map((c) => ({
      solicitud_id: solicitudId,
      tipo: c.tipo,
      numero_documento: c.numero_documento || null,
      monto: Number(c.monto),
      descripcion: c.descripcion || null,
      storage_path: c.storage_path || null,
    }))
  );
  if (errorComprobantes) {
    return NextResponse.json({ error: errorComprobantes.message }, { status: 500 });
  }

  const { error } = await admin
    .from('caja_chica_solicitudes')
    .update({
      estado: 'rendicion_ingresada',
      monto_rendido: montoRendido,
      fecha_rendicion: new Date().toISOString(),
    })
    .eq('id', solicitudId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Avisa a quien aprobó (o a RR.HH./administrador si no hay aprobador
  // registrado) que hay una rendición esperando revisión.
  const destinatarios = new Set();
  if (solicitud.aprobador_id) destinatarios.add(solicitud.aprobador_id);
  const { data: rrhhAdmin } = await admin
    .from('trabajador_roles')
    .select('trabajador_id')
    .in('rol', ['rrhh', 'administrador']);
  (rrhhAdmin || []).forEach((r) => destinatarios.add(r.trabajador_id));

  await admin.from('notificaciones').insert(
    Array.from(destinatarios).map((id) => ({
      trabajador_id: id,
      titulo: 'Caja chica: rendición ingresada',
      cuerpo: `Se ingresó la rendición de "${solicitud.articulo}" — $${montoRendido.toLocaleString('es-CL')} rendidos de $${Number(solicitud.monto_solicitado).toLocaleString('es-CL')}.`,
      relacionado_tipo: 'caja_chica_solicitud',
      relacionado_id: solicitudId,
    }))
  );

  return NextResponse.json({ ok: true, monto_rendido: montoRendido });
}
