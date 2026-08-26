import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { calcularTotales, resolverAprobadorEsperado, puedeAprobar } from '@/lib/cajaChicaLogica';

// Devuelve todo lo que necesita la pantalla de Caja Chica: el período
// abierto (si existe), sus solicitudes ya enriquecidas con nombres y con
// si el que llama puede aprobar/rendir cada una, los totales calculados,
// y (solo para RR.HH./administrador) la lista de aprobadores de respaldo.
export async function GET(req) {
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

  const { data: periodo } = await admin
    .from('caja_chica_periodos')
    .select('*')
    .is('fecha_cierre', null)
    .maybeSingle();

  let solicitudes = [];
  if (periodo) {
    const { data } = await admin
      .from('caja_chica_solicitudes')
      .select('*')
      .eq('periodo_id', periodo.id)
      .order('created_at', { ascending: false });
    solicitudes = data || [];
  }

  const { data: trabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, cargo, jefe_directo_id');
  const nombrePorId = new Map((trabajadores || []).map((t) => [t.id, t.nombre_completo]));
  const trabajadorPorId = new Map((trabajadores || []).map((t) => [t.id, t]));

  const { data: rolesData } = await admin.from('trabajador_roles').select('trabajador_id, rol');
  const rolesPorTrabajador = new Map();
  (rolesData || []).forEach((r) => {
    const lista = rolesPorTrabajador.get(r.trabajador_id) || [];
    lista.push(r.rol);
    rolesPorTrabajador.set(r.trabajador_id, lista);
  });

  const { data: respaldoData } = await admin
    .from('caja_chica_aprobadores_respaldo')
    .select('trabajador_id');
  const aprobadoresRespaldoIds = (respaldoData || []).map((r) => r.trabajador_id);

  const { data: comprobantesData } = periodo
    ? await admin
        .from('caja_chica_comprobantes')
        .select('*')
        .in('solicitud_id', solicitudes.map((s) => s.id).length ? solicitudes.map((s) => s.id) : ['00000000-0000-0000-0000-000000000000'])
    : { data: [] };
  const comprobantesPorSolicitud = new Map();
  (comprobantesData || []).forEach((c) => {
    const lista = comprobantesPorSolicitud.get(c.solicitud_id) || [];
    lista.push(c);
    comprobantesPorSolicitud.set(c.solicitud_id, lista);
  });

  const solicitudesEnriquecidas = solicitudes.map((s) => {
    const aprobadorEsperadoId = resolverAprobadorEsperado(trabajadorPorId.get(s.solicitante_id), rolesPorTrabajador);
    return {
      ...s,
      solicitante_nombre: nombrePorId.get(s.solicitante_id) || '—',
      aprobador_nombre: s.aprobador_id ? nombrePorId.get(s.aprobador_id) || '—' : null,
      entregado_por_nombre: s.entregado_por ? nombrePorId.get(s.entregado_por) || '—' : null,
      rendicion_confirmada_por_nombre: s.rendicion_confirmada_por
        ? nombrePorId.get(s.rendicion_confirmada_por) || '—'
        : null,
      comprobantes: comprobantesPorSolicitud.get(s.id) || [],
      puede_aprobar:
        s.estado === 'pendiente' &&
        puedeAprobar({
          callerId: user.id,
          callerEsRRHH: esRRHH,
          aprobadorEsperadoId,
          aprobadoresRespaldoIds,
        }),
      es_solicitante: s.solicitante_id === user.id,
    };
  });

  const totales = calcularTotales(periodo, solicitudes);

  let aprobadoresRespaldo = [];
  if (esRRHH) {
    aprobadoresRespaldo = aprobadoresRespaldoIds.map((id) => ({
      trabajador_id: id,
      nombre_completo: nombrePorId.get(id) || '—',
    }));
  }

  return NextResponse.json({
    periodo,
    solicitudes: solicitudesEnriquecidas,
    totales,
    esRRHH,
    esJefatura,
    aprobadoresRespaldo,
  });
}
