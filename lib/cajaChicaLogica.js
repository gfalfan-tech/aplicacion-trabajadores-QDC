// Funciones puras (sin dependencias de Next/Supabase) para la lógica de
// Caja Chica: cálculo de totales y quién puede aprobar una solicitud.
// Se usan tanto desde las rutas de API (servidor) como, para formateo,
// desde componentes de cliente.

export function formatearCLP(monto) {
  return Number(monto || 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });
}

// Recalcula desde cero los totales de un período a partir de sus
// solicitudes. No hace math incremental (evita arrastrar errores): siempre
// se recalcula completo a partir del estado actual de cada solicitud.
//   - disponible: plata física que debería haber en la caja ahora mismo.
//   - enProceso: plata comprometida en compras que aún no están cerradas
//     (rendidas) — aprobada, entregada o con rendición ingresada.
//   - vueltoPendiente: plata que algún solicitante todavía debe DEVOLVER a
//     la caja (gastó menos de lo que se le entregó), ya rindió cuentas
//     pero falta que el administrador confirme que la recibió.
//   - deudorPendiente: plata que la caja todavía le debe a algún
//     solicitante (gastó más de lo que se le entregó), falta que el
//     administrador confirme que se la pagó.
export function calcularTotales(periodo, solicitudes) {
  let disponible = periodo ? Number(periodo.monto_inicial) : 0;
  let enProceso = 0;
  let vueltoPendiente = 0;
  let deudorPendiente = 0;

  for (const s of solicitudes) {
    const montoSolicitado = Number(s.monto_solicitado);
    if (['aprobada', 'entregada', 'rendicion_ingresada'].includes(s.estado)) {
      enProceso += montoSolicitado;
    }
    if (s.estado === 'entregada') {
      disponible -= montoSolicitado;
    } else if (s.estado === 'rendicion_ingresada') {
      disponible -= montoSolicitado;
      const diferencia = montoSolicitado - Number(s.monto_rendido);
      if (diferencia > 0) vueltoPendiente += diferencia;
      else if (diferencia < 0) deudorPendiente += -diferencia;
    } else if (s.estado === 'rendida') {
      disponible -= Number(s.monto_rendido);
    }
  }

  return { disponible, enProceso, vueltoPendiente, deudorPendiente };
}

// Determina quién debería aprobar la solicitud de un trabajador: su jefe
// directo, PERO solo si ese jefe tiene acceso al módulo (rol jefatura,
// rrhh o administrador). Si no, no hay un aprobador "natural" y debe
// resolverla alguien de la lista de respaldo (o cualquier RR.HH./admin).
export function resolverAprobadorEsperado(solicitanteTrabajador, rolesPorTrabajador) {
  const jefeId = solicitanteTrabajador?.jefe_directo_id;
  if (!jefeId) return null;
  const rolesJefe = rolesPorTrabajador.get(jefeId) || [];
  const tieneAcceso = rolesJefe.some((r) => ['jefatura', 'rrhh', 'administrador'].includes(r));
  return tieneAcceso ? jefeId : null;
}

// ¿Puede este usuario (callerId, con sus roles) aprobar/rechazar esta
// solicitud? RR.HH./administrador siempre pueden (supervisión general);
// si no, solo el aprobador esperado (jefe directo con acceso al módulo) o,
// si no hay uno válido, alguien de la lista de respaldo.
export function puedeAprobar({ callerId, callerEsRRHH, aprobadorEsperadoId, aprobadoresRespaldoIds }) {
  if (callerEsRRHH) return true;
  if (aprobadorEsperadoId) return callerId === aprobadorEsperadoId;
  return aprobadoresRespaldoIds.includes(callerId);
}
