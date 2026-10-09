// Cuánto del saldo de vacaciones de un trabajador corresponde a un
// PERÍODO ANTERIOR ya vencido y sin usar.
//
// El valor base de "pendientes del período anterior" viene directamente
// del Excel de RR.HH. (columna "Pendiente Periodos anteriores") y se
// guarda en la tabla vacaciones_saldo_inicial como
// pendiente_periodos_anteriores. La vista v_vacaciones_saldo lo expone
// junto con dias_usados_desde_corte (vacaciones aprobadas después de la
// fecha de corte).
//
// Consumo FIFO (primero lo más antiguo):
//   pendientes = max(0, stored_pendientes - gastado)
//   periodo_actual = total - pendientes
//
// Así cuando se aprueba una solicitud de vacaciones y el saldo total
// baja, el descuento se refleja primero en "pendientes del período
// anterior" y solo una vez que ese número llega a 0 empieza a bajar
// "período actual" — se consume primero lo más antiguo.

/**
 * Calcula los días pendientes del período anterior aplicando FIFO:
 * los días usados desde la fecha de corte se descuentan primero de
 * los pendientes anteriores.
 */
export function calcularVacacionesPendientesPeriodoAnterior(saldo) {
  const pendientesStored = saldo?.pendiente_periodos_anteriores || 0;
  const gastado = saldo?.dias_usados_desde_corte || 0;
  const saldoTotal = saldo?.dias_disponibles_estimados || 0;

  // FIFO: el gasto se come primero los pendientes anteriores
  const pendientes = Math.max(0, pendientesStored - gastado);

  // Los pendientes no pueden exceder el saldo total disponible
  return Math.max(0, Math.round(Math.min(pendientes, saldoTotal) * 100) / 100);
}

/**
 * Calcula los días del período actual: el saldo total menos los
 * pendientes del período anterior.
 *
 *   pendiente_periodo_anterior + periodo_actual = vacaciones_disponibles
 */
export function calcularVacacionesPeriodoActual(saldo) {
  const saldoTotal = saldo?.dias_disponibles_estimados || 0;
  const pendientes = calcularVacacionesPendientesPeriodoAnterior(saldo);
  return Math.max(0, Math.round((saldoTotal - pendientes) * 100) / 100);
}
