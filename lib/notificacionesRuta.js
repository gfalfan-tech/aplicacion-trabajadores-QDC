// Traduce una notificación (relacionado_tipo + relacionado_id) a la ruta
// donde debe aterrizar el usuario al hacer clic en ella.
export function rutaDeNotificacion(notificacion, { esRRHH } = {}) {
  const { relacionado_tipo: tipo, relacionado_id: id } = notificacion;

  switch (tipo) {
    case 'solicitud_permiso':
      return '/trabajador/solicitudes';
    case 'solicitud_vacaciones':
      return '/trabajador/vacaciones';
    case 'solicitud_permiso_revision':
    case 'solicitud_vacaciones_revision':
      // Avisa a quien debe aprobar (jefe directo o RR.HH.) — ambos revisan
      // desde la misma pantalla "Mi equipo".
      return '/trabajador/equipo';
    case 'certificado_antiguedad':
      return '/trabajador/certificados';
    case 'certificado_antiguedad_solicitud':
      return esRRHH ? '/rrhh/certificados' : '/trabajador/certificados';
    case 'caja_chica_solicitud':
      return esRRHH ? '/rrhh/caja-chica' : '/trabajador/caja-chica';
    case 'mural_comentario':
    case 'mural_reaccion':
      if (!id) return esRRHH ? '/rrhh/mural' : '/trabajador/mural';
      return `${esRRHH ? '/rrhh/mural' : '/trabajador/mural'}?post=${id}`;
    default:
      return null;
  }
}
