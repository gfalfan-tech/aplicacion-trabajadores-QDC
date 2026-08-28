// Lógica de servidor (solo se usa desde rutas de API, con el cliente de
// llave de servicio) para armar la carpeta "Respaldos": junta lo ya
// cerrado de permisos, vacaciones, caja chica y rendición de gastos, con
// los datos que cada PDF necesita para armarse al momento — no se guarda
// ninguna copia de archivo aparte, se reutiliza exactamente el mismo
// código de PDF que ya usa cada módulo (lib/solicitudPdf.js,
// lib/desgloseCajaChicaPdf.js, lib/rendicionGastosPdf.js).
//
// Ojo: para "vacaciones" y "rendición de gastos" se resuelve el nombre
// del trabajador y del jefe a mano (con un mapa), en vez de pedirle a
// PostgREST que "embeba" la relación con trabajadores() — esas tablas
// tienen más de una columna que apunta a trabajadores (dueño, jefe que
// aprobó, RR.HH./Finanzas que aprobó), y eso es justo lo que ya nos dio
// el error "more than one relationship was found" en rendición de
// gastos. Armar el objeto a mano evita ese problema de raíz.
export async function obtenerDocumentosRespaldos(admin) {
  const { data: trabajadoresData } = await admin.from('trabajadores').select('id, nombre_completo, rut');
  const trabajadorPorId = new Map((trabajadoresData || []).map((t) => [t.id, t]));

  const [{ data: permisosData }, { data: vacacionesData }, { data: cajaChicaData }, { data: rendicionesData }] =
    await Promise.all([
      admin
        .from('solicitudes_permiso')
        .select(
          'id, trabajador_id, fecha_resolucion, fecha_desde, fecha_hasta, hora_desde, hora_hasta, motivo, estado, tipos_permiso(nombre)'
        )
        .eq('estado', 'aprobada'),
      admin
        .from('solicitudes_vacaciones')
        .select(
          'id, trabajador_id, fecha_resolucion, fecha_desde, fecha_hasta, dias_habiles, estado, motivo_edicion, aprobado_por_jefe'
        )
        .eq('estado', 'aprobada'),
      admin
        .from('caja_chica_solicitudes')
        .select('id, solicitante_id, fecha_confirmacion, fecha_rendicion, articulo, created_at, monto_solicitado')
        .eq('estado', 'rendida'),
      admin
        .from('rendiciones_gastos')
        .select('*, rendicion_gastos_lineas(*)')
        .eq('estado', 'aprobada'),
    ]);

  const idsCajaChica = (cajaChicaData || []).map((s) => s.id);
  const { data: comprobantesData } = idsCajaChica.length
    ? await admin.from('caja_chica_comprobantes').select('*').in('solicitud_id', idsCajaChica)
    : { data: [] };
  const comprobantesPorSolicitud = new Map();
  (comprobantesData || []).forEach((c) => {
    const lista = comprobantesPorSolicitud.get(c.solicitud_id) || [];
    lista.push(c);
    comprobantesPorSolicitud.set(c.solicitud_id, lista);
  });

  const permisos = (permisosData || []).map((p) => {
    const trabajador = trabajadorPorId.get(p.trabajador_id);
    return {
      id: p.id,
      trabajador_id: p.trabajador_id,
      trabajador_nombre: trabajador?.nombre_completo || '—',
      fecha: p.fecha_resolucion,
      solicitud: {
        fecha_desde: p.fecha_desde,
        fecha_hasta: p.fecha_hasta,
        hora_desde: p.hora_desde,
        hora_hasta: p.hora_hasta,
        motivo: p.motivo,
        estado: p.estado,
        tipo_permiso: p.tipos_permiso?.nombre,
      },
      trabajador: { nombre_completo: trabajador?.nombre_completo, rut: trabajador?.rut },
    };
  });

  const vacaciones = (vacacionesData || []).map((v) => {
    const trabajador = trabajadorPorId.get(v.trabajador_id);
    const jefe = v.aprobado_por_jefe ? trabajadorPorId.get(v.aprobado_por_jefe) : null;
    return {
      id: v.id,
      trabajador_id: v.trabajador_id,
      trabajador_nombre: trabajador?.nombre_completo || '—',
      fecha: v.fecha_resolucion,
      solicitud: {
        fecha_desde: v.fecha_desde,
        fecha_hasta: v.fecha_hasta,
        dias_habiles: v.dias_habiles,
        estado: v.estado,
        motivo_edicion: v.motivo_edicion,
        jefe_nombre: jefe?.nombre_completo,
      },
      trabajador: { nombre_completo: trabajador?.nombre_completo, rut: trabajador?.rut },
    };
  });

  const cajaChica = (cajaChicaData || []).map((s) => {
    const trabajador = trabajadorPorId.get(s.solicitante_id);
    return {
      id: s.id,
      trabajador_id: s.solicitante_id,
      trabajador_nombre: trabajador?.nombre_completo || '—',
      fecha: s.fecha_confirmacion || s.fecha_rendicion,
      solicitud: {
        solicitante_nombre: trabajador?.nombre_completo || '—',
        articulo: s.articulo,
        created_at: s.created_at,
        monto_solicitado: s.monto_solicitado,
        comprobantes: comprobantesPorSolicitud.get(s.id) || [],
      },
    };
  });

  const rendicionGastos = (rendicionesData || []).map((r) => {
    const trabajador = trabajadorPorId.get(r.trabajador_id);
    const jefe = r.aprobado_por_jefe ? trabajadorPorId.get(r.aprobado_por_jefe) : null;
    return {
      id: r.id,
      trabajador_id: r.trabajador_id,
      trabajador_nombre: trabajador?.nombre_completo || '—',
      fecha: r.fecha_resolucion,
      rendicion: {
        ...r,
        trabajadores: { nombre_completo: trabajador?.nombre_completo, rut: trabajador?.rut },
        jefe_aprobador: { nombre_completo: jefe?.nombre_completo },
      },
    };
  });

  return { permisos, vacaciones, cajaChica, rendicionGastos };
}
