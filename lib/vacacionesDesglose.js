// Arma el desglose que va en el cuadro del comprobante de vacaciones (ver
// lib/solicitudPdf.js): Días hábiles / Vacaciones progresivas / Domingo e
// inhábiles / Saldo pendiente — mismas 4 líneas que traía el formulario en
// papel de feriado legal de la empresa.
//
// `solicitud` debe traer fecha_desde, fecha_hasta, dias_habiles.
// `saldo` es la fila de la vista v_vacaciones_saldo para ese trabajador
// (dias_progresivos_vigentes, dias_disponibles_estimados) — puede venir
// null/undefined si por lo que sea no se pudo cargar, y el desglose igual
// se arma (con 0 en vez de romper la generación del PDF).
export function armarDesgloseVacaciones(solicitud, saldo) {
  const diasCorridos =
    Math.round(
      (new Date(`${solicitud.fecha_hasta}T12:00:00`) - new Date(`${solicitud.fecha_desde}T12:00:00`)) /
        (1000 * 60 * 60 * 24)
    ) + 1;
  const diasHabiles = solicitud.dias_habiles || 0;
  // "Domingo e inhábiles": todo el resto de los días corridos del período
  // que no son día hábil (sábados, domingos y feriados) — así las dos
  // líneas del cuadro suman exactamente el total de días corridos, igual
  // que en el formulario de papel.
  const domingoEInhabiles = Math.max(0, diasCorridos - diasHabiles);

  const vacacionesProgresivas = Math.round((saldo?.dias_progresivos_vigentes ?? 0) * 100) / 100;
  const saldoActual = saldo?.dias_disponibles_estimados ?? 0;
  // Saldo que le queda al trabajador DESPUÉS de esta solicitud (no antes) —
  // así el comprobante deja constancia de cuántos días hábiles le quedan
  // disponibles tras tomar este feriado.
  const saldoPendiente = Math.max(0, Math.round((saldoActual - diasHabiles) * 100) / 100);

  return {
    vacaciones_progresivas: vacacionesProgresivas,
    domingo_e_inhabiles: domingoEInhabiles,
    saldo_pendiente: saldoPendiente,
  };
}
