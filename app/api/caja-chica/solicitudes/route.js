import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { resolverAprobadorEsperado } from '@/lib/cajaChicaLogica';

// Crea una nueva solicitud de compra contra el período de caja chica
// abierto. Solo jefatura, RR.HH. y administrador pueden solicitar.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH, esJefatura } = auth;

  if (!esRRHH && !esJefatura) {
    return NextResponse.json({ error: 'No tienes acceso a Caja Chica.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const monto = Number(body?.monto_solicitado);
  const articulo = (body?.articulo || '').trim();
  const razon = (body?.razon || '').trim();

  if (!monto || monto <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a 0.' }, { status: 400 });
  }
  if (!articulo || !razon) {
    return NextResponse.json({ error: 'Falta indicar el artículo a comprar y la razón.' }, { status: 400 });
  }

  const { data: periodo } = await admin
    .from('caja_chica_periodos')
    .select('*')
    .is('fecha_cierre', null)
    .maybeSingle();

  if (!periodo) {
    return NextResponse.json(
      { error: 'Todavía no hay un fondo de caja chica abierto. RR.HH. debe ingresar el monto inicial primero.' },
      { status: 400 }
    );
  }

  const { data: solicitud, error } = await admin
    .from('caja_chica_solicitudes')
    .insert({
      periodo_id: periodo.id,
      solicitante_id: user.id,
      monto_solicitado: monto,
      articulo,
      razon,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Avisa a quien corresponda aprobar: el jefe directo (si tiene acceso al
  // módulo) o, si no hay uno válido, a los aprobadores de respaldo.
  const { data: solicitante } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, jefe_directo_id')
    .eq('id', user.id)
    .single();

  const { data: rolesData } = await admin.from('trabajador_roles').select('trabajador_id, rol');
  const rolesPorTrabajador = new Map();
  (rolesData || []).forEach((r) => {
    const lista = rolesPorTrabajador.get(r.trabajador_id) || [];
    lista.push(r.rol);
    rolesPorTrabajador.set(r.trabajador_id, lista);
  });

  const aprobadorEsperadoId = resolverAprobadorEsperado(solicitante, rolesPorTrabajador);

  let destinatarios = [];
  if (aprobadorEsperadoId) {
    destinatarios = [aprobadorEsperadoId];
  } else {
    const { data: respaldoData } = await admin
      .from('caja_chica_aprobadores_respaldo')
      .select('trabajador_id');
    destinatarios = (respaldoData || []).map((r) => r.trabajador_id);
  }

  // RR.HH./administrador siempre se entera, exista o no un aprobador
  // directo — así puede hacer seguimiento y aprobar si hace falta.
  const idsRRHH = Array.from(rolesPorTrabajador.entries())
    .filter(([, roles]) => roles.includes('rrhh') || roles.includes('administrador'))
    .map(([id]) => id);
  for (const id of idsRRHH) {
    if (!destinatarios.includes(id)) destinatarios.push(id);
  }

  if (destinatarios.length) {
    await admin.from('notificaciones').insert(
      destinatarios.map((id) => ({
        trabajador_id: id,
        titulo: 'Nueva solicitud de caja chica',
        cuerpo: `${solicitante?.nombre_completo || 'Alguien'} solicitó $${monto.toLocaleString('es-CL')} — ${articulo}.`,
        relacionado_tipo: 'caja_chica_solicitud',
        relacionado_id: solicitud.id,
      }))
    );
  }

  return NextResponse.json({ ok: true, solicitud });
}
