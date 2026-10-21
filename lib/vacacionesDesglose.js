// Arma el desglose que va en el cuadro del comprobante de vacaciones (ver
// lib/solicitudPdf.js):
//   Días hábiles tomados / Días progresivos tomados /
//   Domingo e inhábiles tomados / Saldo pendiente días hábiles
//
// IMPORTANTE: esto es SOLO lo que se ve en el PDF. El cálculo real del saldo
// y de los días progresivos vive en la vista v_vacaciones_saldo y no cambia.
//
// `solicitud` debe traer fecha_desde, fecha_hasta, dias_habiles y estado.
// `saldo` es la fila de la vista v_vacaciones_saldo para ese trabajador
// (dias_disponibles_estimados) — puede venir null/undefined si por lo que
// sea no se pudo cargar, y el desglose igual se arma (con 0 en vez de romper
// la generación del PDF).
// `feriados` es un Set con las fechas ISO (YYYY-MM-DD) de la tabla
// "feriados" — ver cargarFeriados(). Si no se pasa, solo se consideran
// sábados y domingos como inhábiles.

const DIA_MS = 1000 * 60 * 60 * 24;

function aFechaISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function esDiaHabil(d, feriados) {
  const diaSemana = d.getDay();
  return diaSemana !== 0 && diaSemana !== 6 && !feriados.has(aFechaISO(d));
}

/**
 * Trae de la tabla "feriados" las fechas que pueden afectar a una solicitud:
 * las del período pedido más unos días después (para poder contar los días
 * no hábiles que siguen hasta el regreso al trabajo).
 *
 * `cliente` es un cliente de Supabase (el del navegador o el admin del
 * servidor). Devuelve un Set de fechas ISO.
 */
export async function cargarFeriados(cliente, desde, hasta) {
  if (!desde || !hasta) return new Set();
  const limite = new Date(`${hasta}T12:00:00`);
  limite.setDate(limite.getDate() + 21);
  const { data } = await cliente
    .from('feriados')
    .select('fecha')
    .gte('fecha', desde)
    .lte('fecha', aFechaISO(limite));
  return new Set((data || []).map((f) => f.fecha));
}

/**
 * "Domingo e inhábiles tomados": todos los días no hábiles (sábados,
 * domingos y feriados) desde el primer día de vacaciones hasta el día
 * ANTES de volver a trabajar.
 *
 * Ejemplo (Lorena): pide solo el viernes 16 → vuelve el lunes 19, así que
 * el sábado 17 y el domingo 18 cuentan: 2 inhábiles.
 */
export function contarDomingoEInhabiles(fechaDesde, fechaHasta, feriados = new Set()) {
  const desde = new Date(`${fechaDesde}T12:00:00`);
  const hasta = new Date(`${fechaHasta}T12:00:00`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta < desde) return 0;

  // Día de regreso: el primer día hábil después del último día pedido.
  const regreso = new Date(hasta);
  do {
    regreso.setDate(regreso.getDate() + 1);
  } while (!esDiaHabil(regreso, feriados));

  let inhabiles = 0;
  const d = new Date(desde);
  while (d < regreso) {
    if (!esDiaHabil(d, feriados)) inhabiles++;
    d.setDate(d.getDate() + 1);
  }
  return inhabiles;
}

export function armarDesgloseVacaciones(solicitud, saldo, feriados = new Set()) {
  const diasHabiles = solicitud.dias_habiles || 0;
  const domingoEInhabiles = contarDomingoEInhabiles(
    solicitud.fecha_desde,
    solicitud.fecha_hasta,
    feriados
  );

  // "Días progresivos tomados": siempre 0 en el PDF. Los días progresivos
  // ya vienen sumados dentro del saldo total del trabajador, así que nunca
  // se "toman" aparte. (Decisión de visualización solamente — el cálculo de
  // progresivos en la app no se toca.)
  const diasProgresivosTomados = 0;

  // Saldo pendiente = lo que le queda al trabajador después de esta solicitud.
  // La vista v_vacaciones_saldo YA descuenta las solicitudes aprobadas, así
  // que si esta ya está aprobada no hay que restarla otra vez (antes se
  // restaba dos veces: 18,28 − 1 = 17,28). Si todavía está pendiente de
  // aprobación, la vista aún no la descontó y sí se resta aquí.
  // Rechazadas y canceladas no consumen saldo.
  const saldoActual = saldo?.dias_disponibles_estimados ?? 0;
  const consumeSaldo = !['aprobada', 'rechazada', 'cancelada'].includes(solicitud.estado);
  const saldoPendiente = Math.max(
    0,
    Math.round((saldoActual - (consumeSaldo ? diasHabiles : 0)) * 100) / 100
  );

  return {
    dias_progresivos_tomados: diasProgresivosTomados,
    domingo_e_inhabiles: domingoEInhabiles,
    // Valor exacto; el PDF lo muestra con el mismo redondeo que la app
    // (formatDias).
    saldo_pendiente: saldoPendiente,
  };
}
