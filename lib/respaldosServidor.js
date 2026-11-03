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
import { armarDesgloseVacaciones } from './vacacionesDesglose';

// Campos de formalización de la papeleta (check "firmada") y las fechas de
// cada etapa, para la pantalla de Papeletas y el ✓ en Respaldos.
function datosFormalizacion(fila, trabajadorPorId, jefePrimeraFirma) {
  return {
    formalizada_at: fila.formalizada_at || null,
    formalizada_por_nombre: fila.formalizada_por ? trabajadorPorId.get(fila.formalizada_por)?.nombre_completo || null : null,
    linea_tiempo: {
      creada: fila.created_at || null,
      aprobada_jefe: fila.fecha_aprobacion_jefe || null,
      jefe_nombre: jefePrimeraFirma?.nombre_completo || null,
      resolucion: fila.fecha_resolucion || null,
    },
  };
}

// opciones.soloPermisosVacaciones: omite caja chica y rendición de gastos (lo
// usa la pantalla de papeletas, que solo necesita permisos y vacaciones).
export async function obtenerDocumentosRespaldos(admin, opciones = {}) {
  const solo = !!opciones.soloPermisosVacaciones;
  const sinDatos = Promise.resolve({ data: [] });
  const { data: trabajadoresData } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, rut, jefe_directo_id');
  const trabajadorPorId = new Map((trabajadoresData || []).map((t) => [t.id, t]));

  const [{ data: permisosData }, { data: vacacionesData }, { data: cajaChicaData }, { data: rendicionesData }] =
    await Promise.all([
      admin
        .from('solicitudes_permiso')
        .select(
          'id, trabajador_id, created_at, aprobado_por, aprobado_por_jefe, fecha_aprobacion_jefe, formalizada_at, formalizada_por, fecha_resolucion, fecha_desde, fecha_hasta, hora_desde, hora_hasta, motivo, estado, tipos_permiso(nombre)'
        )
        .eq('estado', 'aprobada'),
      admin
        .from('solicitudes_vacaciones')
        .select(
          'id, trabajador_id, created_at, fecha_resolucion, fecha_desde, fecha_hasta, dias_habiles, estado, motivo_edicion, aprobado_por_jefe, fecha_aprobacion_jefe, formalizada_at, formalizada_por, saldo_pendiente_comprobante'
        )
        .eq('estado', 'aprobada'),
      solo
        ? sinDatos
        : admin
            .from('caja_chica_solicitudes')
            .select('id, solicitante_id, fecha_confirmacion, fecha_rendicion, articulo, created_at, monto_solicitado')
            .eq('estado', 'rendida'),
      solo
        ? sinDatos
        : admin.from('rendiciones_gastos').select('*, rendicion_gastos_lineas(*)').eq('estado', 'aprobada'),
    ]);

  // Saldo de vacaciones de cada trabajador con al menos una solicitud acá,
  // para el cuadro de desglose del comprobante (ver
  // lib/vacacionesDesglose.js) — el mismo saldo de HOY, aunque la solicitud
  // sea de un período anterior (la vista no guarda historial por fecha).
  const idsVacaciones = [...new Set((vacacionesData || []).map((v) => v.trabajador_id))];
  const { data: saldosData } = idsVacaciones.length
    ? await admin
        .from('v_vacaciones_saldo')
        .select('trabajador_id, dias_progresivos_vigentes, dias_disponibles_estimados')
        .in('trabajador_id', idsVacaciones)
    : { data: [] };
  const saldoPorTrabajador = new Map((saldosData || []).map((s) => [s.trabajador_id, s]));

  // Feriados legales (una sola consulta para todas las solicitudes), para
  // contar los "domingo e inhábiles" del desglose hasta el día del regreso.
  const { data: feriadosData } = await admin.from('feriados').select('fecha');
  const feriados = new Set((feriadosData || []).map((f) => f.fecha));

  // Solo permisos y vacaciones: no hace falta nada más.
  if (solo) {
    return { permisos, vacaciones, cajaChica: [], rendicionGastos: [], cajaChicaFolios: [] };
  }

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
    const jefe = trabajador?.jefe_directo_id ? trabajadorPorId.get(trabajador.jefe_directo_id) : null;
    const jefePrimeraFirma = p.aprobado_por_jefe ? trabajadorPorId.get(p.aprobado_por_jefe) : null;
    return {
      id: p.id,
      trabajador_id: p.trabajador_id,
      trabajador_nombre: trabajador?.nombre_completo || '—',
      trabajador_rut: trabajador?.rut || '',
      fecha: p.fecha_resolucion,
      ...datosFormalizacion(p, trabajadorPorId, jefePrimeraFirma),
      solicitud: {
        fecha_desde: p.fecha_desde,
        fecha_hasta: p.fecha_hasta,
        hora_desde: p.hora_desde,
        hora_hasta: p.hora_hasta,
        motivo: p.motivo,
        estado: p.estado,
        tipo_permiso: p.tipos_permiso?.nombre,
        // Fecha fija de la resolución, para que el comprobante no cambie
        // cada vez que se vuelve a ver desde Respaldos.
        fecha_resolucion: p.fecha_resolucion,
        // Quién resolvió — para saber si fue justo el jefe directo (ver
        // dibujarCopiaPermiso en lib/solicitudPdf.js).
        aprobado_por: p.aprobado_por,
        // Jefe directo que dio la primera firma (doble aprobación).
        jefe_nombre: jefePrimeraFirma?.nombre_completo,
      },
      trabajador: {
        nombre_completo: trabajador?.nombre_completo,
        rut: trabajador?.rut,
        jefe_directo_id: trabajador?.jefe_directo_id,
        jefe_directo: { nombre_completo: jefe?.nombre_completo },
      },
    };
  });

  const vacaciones = (vacacionesData || []).map((v) => {
    const trabajador = trabajadorPorId.get(v.trabajador_id);
    const jefe = v.aprobado_por_jefe ? trabajadorPorId.get(v.aprobado_por_jefe) : null;
    const desglose = armarDesgloseVacaciones(v, saldoPorTrabajador.get(v.trabajador_id), feriados);
    return {
      id: v.id,
      trabajador_id: v.trabajador_id,
      trabajador_nombre: trabajador?.nombre_completo || '—',
      trabajador_rut: trabajador?.rut || '',
      fecha: v.fecha_resolucion,
      ...datosFormalizacion(v, trabajadorPorId, jefe),
      solicitud: {
        fecha_desde: v.fecha_desde,
        fecha_hasta: v.fecha_hasta,
        dias_habiles: v.dias_habiles,
        estado: v.estado,
        motivo_edicion: v.motivo_edicion,
        jefe_nombre: jefe?.nombre_completo,
        // Fecha fija de la resolución (cuando se aprobó), para que el
        // comprobante quede siempre con esa fecha y no con la de hoy cada
        // vez que se abre desde Respaldos. Sin esto el PDF caía a "hoy".
        fecha_resolucion: v.fecha_resolucion,
        created_at: v.created_at,
        ...desglose,
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

  // Caja chica por FOLIO: todas las cajas (abiertas y cerradas) con sus
  // solicitudes y los comprobantes originales (storage_path), para poder
  // abrir la factura/boleta subida y no solo el desglose generado.
  const { data: periodosData } = await admin
    .from('caja_chica_periodos')
    .select(
      'id, folio, fecha_inicio, fecha_cierre, monto_inicial, rendicion_aprobada_at, efectivo_contado, monto_reintegro, monto_recargado'
    );
  const idsPeriodos = (periodosData || []).map((p) => p.id);
  const { data: solicitudesFolio } = idsPeriodos.length
    ? await admin
        .from('caja_chica_solicitudes')
        .select('id, periodo_id, solicitante_id, articulo, estado, monto_solicitado, created_at, fecha_rendicion')
        .in('periodo_id', idsPeriodos)
        .order('created_at', { ascending: true })
    : { data: [] };
  const idsSolFolio = (solicitudesFolio || []).map((s) => s.id);
  const { data: comprobantesFolio } = idsSolFolio.length
    ? await admin.from('caja_chica_comprobantes').select('*').in('solicitud_id', idsSolFolio)
    : { data: [] };
  const compPorSolFolio = new Map();
  (comprobantesFolio || []).forEach((c) => {
    const lista = compPorSolFolio.get(c.solicitud_id) || [];
    lista.push(c);
    compPorSolFolio.set(c.solicitud_id, lista);
  });
  const solicitudesPorPeriodo = new Map();
  (solicitudesFolio || []).forEach((s) => {
    const nombre = trabajadorPorId.get(s.solicitante_id)?.nombre_completo || '—';
    const lista = solicitudesPorPeriodo.get(s.periodo_id) || [];
    lista.push({
      id: s.id,
      solicitante_nombre: nombre,
      articulo: s.articulo,
      estado: s.estado,
      monto_solicitado: s.monto_solicitado,
      created_at: s.created_at,
      fecha_rendicion: s.fecha_rendicion,
      comprobantes: compPorSolFolio.get(s.id) || [],
    });
    solicitudesPorPeriodo.set(s.periodo_id, lista);
  });
  const cajaChicaFolios = (periodosData || [])
    .map((p) => ({
      ...p,
      estado_folio: p.fecha_cierre ? 'cerrado' : p.rendicion_aprobada_at ? 'aprobado' : 'abierto',
      solicitudes: solicitudesPorPeriodo.get(p.id) || [],
    }))
    .sort((a, b) => (b.folio ?? -1) - (a.folio ?? -1));

  return { permisos, vacaciones, cajaChica, rendicionGastos, cajaChicaFolios };
}
