import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { calcularTotales } from '@/lib/cajaChicaLogica';

// GET ?reporte=1 -> el reporte del período abierto para "Rendir caja
// chica" (saldo inicial, solicitudes, compras por tipo de comprobante,
// quién compró/aprobó, y el total que debería haber físicamente).
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, esRRHH } = auth;
  if (!esRRHH) {
    return NextResponse.json({ error: 'Solo RR.HH./administrador puede ver este reporte.' }, { status: 403 });
  }

  const { data: periodo } = await admin
    .from('caja_chica_periodos')
    .select('*')
    .is('fecha_cierre', null)
    .maybeSingle();

  if (!periodo) {
    return NextResponse.json({ periodo: null, solicitudes: [], totales: null });
  }

  const { data: solicitudes } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('periodo_id', periodo.id)
    .order('created_at', { ascending: true });

  const idsSolicitudes = (solicitudes || []).map((s) => s.id);
  const { data: comprobantes } = idsSolicitudes.length
    ? await admin.from('caja_chica_comprobantes').select('*').in('solicitud_id', idsSolicitudes)
    : { data: [] };

  const { data: trabajadores } = await admin.from('trabajadores').select('id, nombre_completo');
  const nombrePorId = new Map((trabajadores || []).map((t) => [t.id, t.nombre_completo]));

  const comprobantesPorSolicitud = new Map();
  (comprobantes || []).forEach((c) => {
    const lista = comprobantesPorSolicitud.get(c.solicitud_id) || [];
    lista.push(c);
    comprobantesPorSolicitud.set(c.solicitud_id, lista);
  });

  const solicitudesEnriquecidas = (solicitudes || []).map((s) => ({
    ...s,
    solicitante_nombre: nombrePorId.get(s.solicitante_id) || '—',
    aprobador_nombre: s.aprobador_id ? nombrePorId.get(s.aprobador_id) || '—' : null,
    comprobantes: comprobantesPorSolicitud.get(s.id) || [],
  }));

  const totales = calcularTotales(periodo, solicitudes || []);
  const pendientesDeCierre = solicitudesEnriquecidas.filter(
    (s) => !['rendida', 'rechazada'].includes(s.estado)
  ).length;

  return NextResponse.json({
    periodo,
    solicitudes: solicitudesEnriquecidas,
    totales,
    pendientesDeCierre,
  });
}

// POST: si no hay período abierto, crea el primero con { monto } como
// fondo inicial. Si ya hay uno abierto, es una recarga: exige que todas
// las solicitudes de ese período estén en un estado terminal (rendida o
// rechazada), lo cierra, y abre uno nuevo con
// monto_inicial = saldo físico actual + { monto } agregado.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH } = auth;
  if (!esRRHH) {
    return NextResponse.json({ error: 'Solo RR.HH./administrador puede administrar el fondo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const monto = Number(body?.monto);
  const notas = (body?.notas || '').trim() || null;
  if (!monto || monto <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a 0.' }, { status: 400 });
  }

  const { data: periodoAbierto } = await admin
    .from('caja_chica_periodos')
    .select('*')
    .is('fecha_cierre', null)
    .maybeSingle();

  if (!periodoAbierto) {
    const { data: nuevo, error } = await admin
      .from('caja_chica_periodos')
      .insert({ monto_inicial: monto, abierto_por: user.id, notas })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, periodo: nuevo });
  }

  const { data: solicitudes } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('periodo_id', periodoAbierto.id);

  const noTerminales = (solicitudes || []).filter((s) => !['rendida', 'rechazada'].includes(s.estado));
  if (noTerminales.length > 0) {
    return NextResponse.json(
      {
        error: `Hay ${noTerminales.length} solicitud(es) todavía en curso (sin rendir) en este período. Complétalas antes de recargar el fondo.`,
      },
      { status: 400 }
    );
  }

  const { disponible } = calcularTotales(periodoAbierto, solicitudes || []);

  const ahora = new Date().toISOString();
  const { error: errorCierre } = await admin
    .from('caja_chica_periodos')
    .update({ fecha_cierre: ahora, saldo_final: disponible, cerrado_por: user.id })
    .eq('id', periodoAbierto.id);
  if (errorCierre) return NextResponse.json({ error: errorCierre.message }, { status: 500 });

  const { data: nuevoPeriodo, error: errorNuevo } = await admin
    .from('caja_chica_periodos')
    .insert({
      monto_inicial: disponible + monto,
      abierto_por: user.id,
      notas,
    })
    .select()
    .single();
  if (errorNuevo) return NextResponse.json({ error: errorNuevo.message }, { status: 500 });

  return NextResponse.json({ ok: true, periodo: nuevoPeriodo, periodoAnteriorCerrado: periodoAbierto.id });
}
