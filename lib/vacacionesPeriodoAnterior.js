// Cuánto del saldo de vacaciones de un trabajador corresponde a un
// PERÍODO ANTERIOR ya vencido y sin usar — concepto que no existía antes
// en el sistema (que solo manejaba un saldo corrido único, sin separar
// por año). Definición acordada con Germán:
//
// - El "período" de cada trabajador va del aniversario de su
//   fecha_ingreso al siguiente aniversario (el criterio estándar del
//   feriado legal chileno, no el año calendario ni la fecha_corte del
//   saldo).
// - El "período actual" nunca muestra más de un período completo (15
//   días hábiles + los progresivos que tenga vigentes hoy) — es el tope
//   de lo que se puede devengar dentro de un período. Todo lo que el
//   saldo total exceda ese tope se muestra como "pendiente del período
//   anterior": es la porción que, según el criterio de la Dirección del
//   Trabajo, ya debería haberse tomado (si un trabajador arrastra 2+
//   períodos sin usar, acá solo se marca uno; el resto igual está
//   incluido en "vacaciones disponibles", no se desglosa en más).
// - Este orden (tope en "período actual", el resto a "pendientes") es
//   a propósito: así cuando se aprueba una solicitud de vacaciones y el
//   saldo total baja, el descuento se refleja primero en "pendientes
//   del período anterior" y solo una vez que ese número llega a 0 empieza
//   a bajar "período actual" — se consume primero lo más antiguo.
//
// No depende de una columna nueva en la base de datos: se calcula al
// vuelo a partir de lo que ya expone v_vacaciones_saldo (fecha_ingreso,
// dias_progresivos_vigentes, dias_disponibles_estimados).
export function calcularVacacionesPeriodoActual(saldo) {
  const saldoTotal = saldo?.dias_disponibles_estimados || 0;

  if (!saldo?.fecha_ingreso) return Math.max(0, Math.round(saldoTotal * 100) / 100);

  const [anioIngreso, mesIngreso, diaIngreso] = saldo.fecha_ingreso.split('-').map(Number);
  const hoy = new Date();

  // Antigüedad en años completos (baja uno si todavía no llega el
  // aniversario de este año).
  let anios = hoy.getFullYear() - anioIngreso;
  const aniversarioEsteAnio = new Date(hoy.getFullYear(), mesIngreso - 1, diaIngreso);
  if (hoy < aniversarioEsteAnio) anios -= 1;

  // Aún no completa su primer período: no hay "pendiente de período
  // anterior" posible todavía, todo el saldo es "período actual".
  if (anios < 1) return Math.max(0, Math.round(saldoTotal * 100) / 100);

  const unPeriodo = 15 + (saldo.dias_progresivos_vigentes || 0);
  return Math.max(0, Math.round(Math.min(saldoTotal, unPeriodo) * 100) / 100);
}

// Vacaciones PENDIENTES DEL PERÍODO ANTERIOR: el resto del saldo total
// una vez separado el tope de "período actual" de arriba, así los dos
// números siempre cuadran con el total:
//
//   pendiente_periodo_anterior + periodo_actual = vacaciones_disponibles
export function calcularVacacionesPendientesPeriodoAnterior(saldo) {
  const periodoActual = calcularVacacionesPeriodoActual(saldo);
  const saldoTotal = saldo?.dias_disponibles_estimados || 0;
  return Math.max(0, Math.round((saldoTotal - periodoActual) * 100) / 100);
}
