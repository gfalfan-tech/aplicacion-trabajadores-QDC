// Cruza el detalle de asistencia (días sin marca / con atraso) contra las
// tres fuentes que pueden "justificar" un día en la app: vacaciones
// aprobadas, permisos aprobados y licencias médicas registradas por
// RR.HH. — para poder explicarle a quien revisa el reporte de marcaje por
// qué un día no tiene marca, o por qué un atraso puede no ser un atraso
// real. Ver components/ModalDetalleAsistencia.js (lo usa en vivo, al
// mostrar el detalle) y app/api/admin/subir-asistencia/route.js (lo usa al
// subir el reporte, para ajustar el total oficial de días de inasistencia).
//
// Importante: un día COMPLETO (vacaciones, licencia médica, o un permiso
// sin horario — es decir, todo el día) se puede cruzar con total certeza,
// porque coincide con un rango de fechas. Un permiso CON horario
// (hora_desde/hora_hasta) solo puede explicar un atraso o una salida
// anticipada de forma aproximada, porque hoy no se guarda la hora real de
// marcaje — por eso esos casos quedan marcados con completo:false, para
// mostrarse como "posible justificación" y no restarse solos de los
// totales oficiales.

// Arma la lista de fechas ISO ("YYYY-MM-DD") entre dos fechas ISO, ambas
// incluidas.
export function fechasEnRango(desdeISO, hastaISO) {
  const [a, m, d] = desdeISO.split('-').map(Number);
  const fechas = [];
  const cursor = new Date(a, m - 1, d);
  const iso = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  while (iso(cursor) <= hastaISO) {
    fechas.push(iso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return fechas;
}

// Arma un Map(fecha ISO -> { tipo, detalle, completo }) a partir de listas
// YA TRAÍDAS de vacaciones aprobadas, permisos aprobados y licencias
// médicas (no hace ninguna consulta acá — así sirve tanto en el cliente,
// con lib/supabaseClient, como en una ruta de servidor con el cliente
// admin de service role). Si un día calza con más de una fuente, gana la
// más "fuerte" (completo siempre le gana a parcial).
export function armarMapaJustificaciones({ vacaciones, permisos, licencias }) {
  const porDia = new Map();

  function marcar(fecha, entrada, prioridad) {
    const actual = porDia.get(fecha);
    if (!actual || prioridad > actual.prioridad) {
      porDia.set(fecha, { ...entrada, prioridad });
    }
  }

  for (const v of vacaciones || []) {
    for (const f of fechasEnRango(v.fecha_desde, v.fecha_hasta)) {
      marcar(f, { tipo: 'vacaciones', detalle: 'Vacaciones autorizadas', completo: true }, 3);
    }
  }

  for (const l of licencias || []) {
    for (const f of fechasEnRango(l.fecha_desde, l.fecha_hasta)) {
      marcar(f, { tipo: 'licencia_medica', detalle: 'Licencia médica', completo: true }, 3);
    }
  }

  for (const p of permisos || []) {
    const completo = !p.hora_desde || !p.hora_hasta;
    const nombreTipo = p.tipos_permiso?.nombre || 'Permiso';
    const detalle = completo
      ? `Permiso aprobado (${nombreTipo}, día completo)`
      : `Posible atraso justificado por permiso (${nombreTipo}, ${p.hora_desde.slice(0, 5)}–${p.hora_hasta.slice(0, 5)})`;
    for (const f of fechasEnRango(p.fecha_desde, p.fecha_hasta)) {
      marcar(f, { tipo: 'permiso', detalle, completo }, completo ? 2 : 1);
    }
  }

  return porDia;
}

// Conveniencia para el cliente (componentes 'use client'): trae vacaciones,
// permisos y licencias médicas que se solapan con [periodoDesde,
// periodoHasta] para un trabajador, y devuelve el mapa de justificaciones
// ya armado. Se calcula EN VIVO cada vez que se abre el detalle (no
// depende de que el cruce ya se haya hecho al subir el reporte) — así, si
// el permiso o la licencia se registran después de subir el archivo,
// igual queda reflejado acá sin tener que volver a subirlo.
export async function obtenerJustificacionesPeriodo(supabase, trabajadorId, periodoDesde, periodoHasta) {
  const [{ data: vacaciones }, { data: permisos }, { data: licencias }] = await Promise.all([
    supabase
      .from('solicitudes_vacaciones')
      .select('fecha_desde, fecha_hasta')
      .eq('trabajador_id', trabajadorId)
      .eq('estado', 'aprobada')
      .lte('fecha_desde', periodoHasta)
      .gte('fecha_hasta', periodoDesde),
    supabase
      .from('solicitudes_permiso')
      .select('fecha_desde, fecha_hasta, hora_desde, hora_hasta, tipos_permiso(nombre)')
      .eq('trabajador_id', trabajadorId)
      .eq('estado', 'aprobada')
      .lte('fecha_desde', periodoHasta)
      .gte('fecha_hasta', periodoDesde),
    supabase
      .from('licencias_medicas')
      .select('fecha_desde, fecha_hasta')
      .eq('trabajador_id', trabajadorId)
      .lte('fecha_desde', periodoHasta)
      .gte('fecha_hasta', periodoDesde),
  ]);

  return armarMapaJustificaciones({ vacaciones, permisos, licencias });
}
