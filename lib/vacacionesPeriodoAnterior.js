// Cuánto del saldo de vacaciones de un trabajador corresponde a un
// PERÍODO ANTERIOR ya vencido y sin usar — concepto que no existía antes
// en el sistema (que solo manejaba un saldo corrido único, sin separar
// por año). Definición acordada con Germán:
//
// - El "período" de cada trabajador va del aniversario de su
//   fecha_ingreso al siguiente aniversario (el criterio estándar del
//   feriado legal chileno, no el año calendario ni la fecha_corte del
//   saldo).
// - Si el trabajador ya cruzó al menos un aniversario sin haber
//   alcanzado a usar un período completo, ESE período entero (15 días
//   hábiles + los progresivos que tenga vigentes hoy) se muestra como
//   "pendiente del período anterior" — es la porción de su saldo total
//   que, según el criterio de la Dirección del Trabajo, ya debería
//   haberse tomado. El resto del saldo (si sobra) sigue siendo parte del
//   saldo disponible normal, pero no se desglosa en más períodos
//   atrasados (si un trabajador arrastra 2+ períodos sin usar, acá solo
//   se marca uno; el resto igual está incluido en "vacaciones
//   disponibles").
//
// No depende de una columna nueva en la base de datos: se calcula al
// vuelo a partir de lo que ya expone v_vacaciones_saldo (fecha_ingreso,
// dias_progresivos_vigentes, dias_disponibles_estimados).
export function calcularVacacionesPendientesPeriodoAnterior(saldo) {
  if (!saldo?.fecha_ingreso) return 0;

  const [anioIngreso, mesIngreso, diaIngreso] = saldo.fecha_ingreso.split('-').map(Number);
  const hoy = new Date();

  // Antigüedad en años completos (baja uno si todavía no llega el
  // aniversario de este año).
  let anios = hoy.getFullYear() - anioIngreso;
  const aniversarioEsteAnio = new Date(hoy.getFullYear(), mesIngreso - 1, diaIngreso);
  if (hoy < aniversarioEsteAnio) anios -= 1;
  if (anios < 1) return 0; // aún no completa su primer período — no hay "período anterior"

  const unPeriodo = 15 + (saldo.dias_progresivos_vigentes || 0);
  const saldoTotal = saldo.dias_disponibles_estimados || 0;
  return Math.max(0, Math.round(Math.min(saldoTotal, unPeriodo) * 100) / 100);
}
