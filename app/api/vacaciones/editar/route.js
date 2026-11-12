import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Permite al JEFE DIRECTO corregir las fechas de una solicitud de
// vacaciones de alguien de su equipo, mientras RR.HH. no haya dado la firma
// final: sirve para solicitudes 'pendiente' o 'aprobada_jefe'.
//
// Al guardar, la solicitud queda en 'aprobada_jefe' (aprobada por el jefe,
// con las nuevas fechas) a la espera de la firma de RR.HH. Se recalculan los
// días hábiles con el mismo criterio de siempre (lunes a viernes, sin
// feriados), se exige motivo, se guarda quién/cuándo/por qué y se avisa al
// trabajador.
//
// Las vacaciones ya firmadas por RR.HH. ('aprobada') las sigue corrigiendo
// RR.HH. desde /api/admin/administrar-vacacion.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }

  const body = await req.json().catch(() => ({}));
  const { solicitudId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = body;
  const motivo = (body?.motivo || '').trim();

  if (!solicitudId || !fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    return NextResponse.json({ error: 'Las fechas no son válidas.' }, { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json({ error: 'Debes indicar el motivo del cambio.' }, { status: 400 });
  }

  const { data: solicitud } = await auth.admin
    .from('solicitudes_vacaciones')
    .select('id, trabajador_id, estado')
    .eq('id', solicitudId)
    .maybeSingle();
  if (!solicitud) {
    return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  }
  if (solicitud.estado !== 'pendiente' && solicitud.estado !== 'aprobada_jefe') {
    return NextResponse.json(
      { error: 'Esta solicitud ya no se puede editar desde aquí (ya fue resuelta por RR.HH. o cerrada).' },
      { status: 409 }
    );
  }

  // Solo el jefe directo de esa persona (con rol jefatura/RR.HH./administrador).
  const { data: trabajador } = await auth.admin
    .from('trabajadores')
    .select('jefe_directo_id')
    .eq('id', solicitud.trabajador_id)
    .maybeSingle();
  const habilitado = auth.esJefatura || auth.esRRHH;
  if (!habilitado || trabajador?.jefe_directo_id !== auth.user.id) {
    return NextResponse.json(
      { error: 'Solo el jefe directo de esta persona puede editar sus vacaciones.' },
      { status: 403 }
    );
  }

  // Días hábiles: mismo criterio que usa el trabajador al solicitar.
  const { data: feriadosData } = await auth.admin
    .from('feriados')
    .select('fecha')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta);
  const feriados = new Set((feriadosData || []).map((f) => f.fecha));
  let diasHabiles = 0;
  const d = new Date(`${fechaDesde}T12:00:00`);
  const fin = new Date(`${fechaHasta}T12:00:00`);
  while (d <= fin) {
    const diaSemana = d.getDay();
    const fechaISO = d.toISOString().slice(0, 10);
    if (diaSemana !== 0 && diaSemana !== 6 && !feriados.has(fechaISO)) diasHabiles++;
    d.setDate(d.getDate() + 1);
  }
  if (diasHabiles === 0) {
    return NextResponse.json(
      { error: 'Ese rango no tiene días hábiles (solo fines de semana o feriados).' },
      { status: 400 }
    );
  }

  const ahora = new Date().toISOString();
  const { error } = await auth.admin
    .from('solicitudes_vacaciones')
    .update({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      dias_habiles: diasHabiles,
      estado: 'aprobada_jefe',
      aprobado_por_jefe: auth.user.id,
      fecha_aprobacion_jefe: ahora,
      editado_por: auth.user.id,
      editado_en: ahora,
      motivo_edicion: motivo,
    })
    .eq('id', solicitudId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await auth.admin.from('notificaciones').insert({
    trabajador_id: solicitud.trabajador_id,
    titulo: 'Tu solicitud de vacaciones fue modificada',
    cuerpo: `Tu jefe directo ajustó tu solicitud de vacaciones: ahora es del ${fechaDesde} al ${fechaHasta} (${diasHabiles} días hábiles) y quedó a la espera de la firma de RR.HH. Motivo: ${motivo}`,
    relacionado_tipo: 'solicitud_vacaciones_editada',
    relacionado_id: solicitudId,
  });

  return NextResponse.json({ ok: true, dias_habiles: diasHabiles });
}
