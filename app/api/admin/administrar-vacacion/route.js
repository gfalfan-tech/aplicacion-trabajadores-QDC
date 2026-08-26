import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Permite a RR.HH./administrador, por fuerza mayor, corregir las fechas
// de una reserva de vacaciones ya aprobada o cancelarla del todo.
//
// - accion "editar": cambia fecha_desde/fecha_hasta y recalcula
//   dias_habiles. La solicitud sigue "aprobada", solo con otras fechas.
// - accion "cancelar": pasa la solicitud a estado "cancelada" — no se
//   borra, queda como registro histórico con el motivo. El saldo de
//   vacaciones se libera solo, porque la vista de saldo únicamente
//   descuenta solicitudes en estado 'aprobada'.
//
// En ambos casos se le notifica al trabajador y queda guardado quién
// hizo el cambio, cuándo y por qué (motivo obligatorio).
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
  const accion = body?.accion;
  const motivo = (body?.motivo || '').trim();

  if (!solicitudId || (accion !== 'editar' && accion !== 'cancelar')) {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json(
      { error: 'Debes indicar el motivo (por ejemplo, la razón de fuerza mayor).' },
      { status: 400 }
    );
  }

  const { data: solicitud } = await auth.admin
    .from('solicitudes_vacaciones')
    .select('id, trabajador_id, estado, fecha_desde, fecha_hasta')
    .eq('id', solicitudId)
    .maybeSingle();
  if (!solicitud) {
    return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  }

  const ahora = new Date().toISOString();
  let cambios;
  let notifTitulo;
  let notifCuerpo;
  let notifTipo;

  if (accion === 'cancelar') {
    cambios = {
      estado: 'cancelada',
      comentario_resolucion: motivo,
      editado_por: auth.user.id,
      editado_en: ahora,
      motivo_edicion: motivo,
    };
    notifTitulo = 'Tu solicitud de vacaciones fue cancelada';
    notifCuerpo = `RR.HH. canceló tu solicitud de vacaciones del ${solicitud.fecha_desde} al ${solicitud.fecha_hasta}. Motivo: ${motivo}`;
    notifTipo = 'solicitud_vacaciones_cancelada';
  } else {
    const fechaDesde = body?.fecha_desde;
    const fechaHasta = body?.fecha_hasta;
    if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
      return NextResponse.json({ error: 'Las fechas no son válidas.' }, { status: 400 });
    }

    // Recalcula días hábiles con los mismos criterios que usa el
    // trabajador al solicitar: lunes a viernes, sin feriados.
    const { data: feriadosData } = await auth.admin
      .from('feriados')
      .select('fecha')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta);
    const feriados = new Set((feriadosData || []).map((f) => f.fecha));
    let diasHabiles = 0;
    let d = new Date(`${fechaDesde}T12:00:00`);
    const fin = new Date(`${fechaHasta}T12:00:00`);
    while (d <= fin) {
      const diaSemana = d.getDay();
      const fechaISO = d.toISOString().slice(0, 10);
      if (diaSemana !== 0 && diaSemana !== 6 && !feriados.has(fechaISO)) diasHabiles++;
      d.setDate(d.getDate() + 1);
    }

    cambios = {
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      dias_habiles: diasHabiles,
      editado_por: auth.user.id,
      editado_en: ahora,
      motivo_edicion: motivo,
    };
    notifTitulo = 'Tu solicitud de vacaciones fue modificada';
    notifCuerpo = `RR.HH. corrigió tu solicitud de vacaciones: ahora es del ${fechaDesde} al ${fechaHasta} (${diasHabiles} días hábiles). Motivo: ${motivo}`;
    notifTipo = 'solicitud_vacaciones_editada';
  }

  const { error } = await auth.admin
    .from('solicitudes_vacaciones')
    .update(cambios)
    .eq('id', solicitudId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await auth.admin.from('notificaciones').insert({
    trabajador_id: solicitud.trabajador_id,
    titulo: notifTitulo,
    cuerpo: notifCuerpo,
    relacionado_tipo: notifTipo,
    relacionado_id: solicitudId,
  });

  return NextResponse.json({ ok: true });
}
