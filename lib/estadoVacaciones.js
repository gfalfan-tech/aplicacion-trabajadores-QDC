// Helpers compartidos para mostrar el estado de una solicitud de
// vacaciones, ahora que puede pasar por dos etapas de aprobación
// ('pendiente' -> 'aprobada_jefe' -> 'aprobada', o terminar antes en
// 'rechazada'/'cancelada'). Los mismos textos/colores se usan en
// /trabajador/vacaciones (el propio trabajador) y en /rrhh/trabajadores/[id]
// (RR.HH. mirando el historial de otra persona).

export const estadoVacacionesStyle = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada_jefe: 'bg-blue-100 text-blue-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600',
};

// El resto de los estados se muestran tal cual (son el mismo texto que el
// valor del enum: "pendiente", "aprobada", "rechazada", "cancelada").
export function estadoVacacionesLabel(estado) {
  if (estado === 'aprobada_jefe') return 'aprobada, a la espera de firma de RRHH';
  return estado;
}

// Arma las líneas de fecha para mostrar en pantalla: envío, aprobación del
// jefe directo (si la hubo) y resolución final. La resolución final puede
// haberla hecho RR.HH. (segunda firma, o aprobación/rechazo único cuando no
// hay jefe directo) o el propio jefe directo (si rechazó en la primera
// etapa, ahí el flujo termina sin llegar a RR.HH.) — por eso se calcula
// comparando aprobado_por con el jefe_directo_id del trabajador, en vez de
// asumir que la resolución final siempre es de RR.HH.
export function fechasResolucionVacaciones(solicitud, jefeDirectoId) {
  const fechas = [{ etiqueta: 'Solicitud enviada', fecha: solicitud.created_at }];

  if (solicitud.fecha_aprobacion_jefe) {
    fechas.push({ etiqueta: 'Aprobada por tu jefe directo', fecha: solicitud.fecha_aprobacion_jefe });
  }

  if (solicitud.fecha_resolucion) {
    const loResolvioElJefe =
      !solicitud.fecha_aprobacion_jefe &&
      solicitud.aprobado_por &&
      solicitud.aprobado_por === jefeDirectoId;
    const quien = loResolvioElJefe ? 'tu jefe directo' : 'RR.HH.';
    const accion = solicitud.estado === 'rechazada' ? 'Rechazada por' : 'Resuelta por';
    fechas.push({ etiqueta: `${accion} ${quien}`, fecha: solicitud.fecha_resolucion });
  }

  return fechas;
}
