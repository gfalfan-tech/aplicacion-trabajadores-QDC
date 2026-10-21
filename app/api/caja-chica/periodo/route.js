import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { calcularTotales } from '@/lib/cajaChicaLogica';

const ESTADOS_TERMINALES = ['rendida', 'rechazada'];

// Arma el reporte completo de un período (abierto o cerrado): sus
// solicitudes con nombres y comprobantes, los totales y los nombres de
// quienes abrieron, aprobaron la rendición y cerraron la caja. Lo usan el
// "Rendir caja chica" (período abierto) y el historial de folios.
async function armarReporte(admin, periodo) {
  const { data: solicitudes } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('periodo_id', periodo.id)
    .order('created_at', { ascending: true });

  const idsSolicitudes = (solicitudes || []).map((s) => s.id);
  const { data: comprobantes } = idsSolicitudes.length
    ? await admin.from('caja_chica_comprobantes').select('*').in('solicitud_id', idsSolicitudes)
    : { data: [] };

  const { data: trabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, cargo, areas(nombre)');
  const nombrePorId = new Map((trabajadores || []).map((t) => [t.id, t.nombre_completo]));
  const trabajadorPorId = new Map((trabajadores || []).map((t) => [t.id, t]));

  const comprobantesPorSolicitud = new Map();
  (comprobantes || []).forEach((c) => {
    const lista = comprobantesPorSolicitud.get(c.solicitud_id) || [];
    lista.push(c);
    comprobantesPorSolicitud.set(c.solicitud_id, lista);
  });

  const solicitudesEnriquecidas = (solicitudes || []).map((s) => ({
    ...s,
    solicitante_nombre: nombrePorId.get(s.solicitante_id) || '—',
    solicitante_area: trabajadorPorId.get(s.solicitante_id)?.areas?.nombre || null,
    aprobador_nombre: s.aprobador_id ? nombrePorId.get(s.aprobador_id) || '—' : null,
    comprobantes: comprobantesPorSolicitud.get(s.id) || [],
  }));

  const totales = calcularTotales(periodo, solicitudes || []);
  const pendientesDeCierre = solicitudesEnriquecidas.filter(
    (s) => !ESTADOS_TERMINALES.includes(s.estado)
  ).length;

  return {
    periodo: {
      ...periodo,
      abierto_por_nombre: nombrePorId.get(periodo.abierto_por) || '—',
      rendicion_aprobada_por_nombre: periodo.rendicion_aprobada_por
        ? nombrePorId.get(periodo.rendicion_aprobada_por) || '—'
        : null,
      cerrado_por_nombre: periodo.cerrado_por ? nombrePorId.get(periodo.cerrado_por) || '—' : null,
    },
    solicitudes: solicitudesEnriquecidas,
    totales,
    pendientesDeCierre,
  };
}

// GET ?reporte=1            -> reporte del período abierto ("Rendir caja chica").
// GET ?reporte=1&periodo_id -> reporte de un folio ya cerrado (historial).
// GET ?historial=1          -> lista de folios cerrados.
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

  const url = new URL(req.url);

  if (url.searchParams.get('historial')) {
    const { data } = await admin
      .from('caja_chica_periodos')
      .select(
        'id, folio, fecha_inicio, fecha_cierre, monto_inicial, efectivo_contado, monto_reintegro, monto_recargado, codigo_verificacion'
      )
      .not('fecha_cierre', 'is', null)
      .not('folio', 'is', null)
      .order('folio', { ascending: false });
    return NextResponse.json({ periodos: data || [] });
  }

  const periodoId = url.searchParams.get('periodo_id');
  let periodo = null;
  if (periodoId) {
    const { data } = await admin.from('caja_chica_periodos').select('*').eq('id', periodoId).maybeSingle();
    periodo = data;
    if (!periodo) {
      return NextResponse.json({ error: 'No se encontró ese folio.' }, { status: 404 });
    }
  } else {
    const { data } = await admin
      .from('caja_chica_periodos')
      .select('*')
      .is('fecha_cierre', null)
      .maybeSingle();
    periodo = data;
  }

  if (!periodo) {
    return NextResponse.json({ periodo: null, solicitudes: [], totales: null });
  }

  return NextResponse.json(await armarReporte(admin, periodo));
}

// POST: si no hay período abierto, crea el primero con { monto } como
// fondo inicial (el folio lo asigna la base de datos, correlativo).
//
// Si ya hay uno abierto, es la RECARGA: exige que RR.HH. ya haya aprobado
// la rendición de la caja (efectivo contado + monto a reintegrar, ver
// /api/caja-chica/periodo/aprobar) y que todas las solicitudes estén en un
// estado terminal. Cierra el folio y abre el siguiente con
// monto_inicial = efectivo contado + { monto } recibido.
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
  const monto = Math.round(Number(body?.monto));
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

  if (!periodoAbierto.rendicion_aprobada_at) {
    return NextResponse.json(
      { error: 'Primero debes aprobar la rendición de la caja (efectivo contado y monto a reintegrar).' },
      { status: 400 }
    );
  }

  const { data: solicitudes } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('periodo_id', periodoAbierto.id);

  const noTerminales = (solicitudes || []).filter((s) => !ESTADOS_TERMINALES.includes(s.estado));
  if (noTerminales.length > 0) {
    return NextResponse.json(
      {
        error: `Hay ${noTerminales.length} solicitud(es) todavía en curso (sin rendir) en este período. Complétalas antes de recargar el fondo.`,
      },
      { status: 400 }
    );
  }

  const efectivoContado = Number(periodoAbierto.efectivo_contado);

  const ahora = new Date().toISOString();
  const { error: errorCierre } = await admin
    .from('caja_chica_periodos')
    .update({
      fecha_cierre: ahora,
      saldo_final: efectivoContado,
      monto_recargado: monto,
      cerrado_por: user.id,
    })
    .eq('id', periodoAbierto.id);
  if (errorCierre) return NextResponse.json({ error: errorCierre.message }, { status: 500 });

  const { data: nuevoPeriodo, error: errorNuevo } = await admin
    .from('caja_chica_periodos')
    .insert({
      monto_inicial: efectivoContado + monto,
      abierto_por: user.id,
      notas,
    })
    .select()
    .single();
  if (errorNuevo) return NextResponse.json({ error: errorNuevo.message }, { status: 500 });

  return NextResponse.json({ ok: true, periodo: nuevoPeriodo, periodoAnteriorCerrado: periodoAbierto.id });
}
