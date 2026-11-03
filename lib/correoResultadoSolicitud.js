// Envía por correo al trabajador el resultado de su solicitud de permiso o
// vacaciones. Se llama desde /api/push/enviar, que ya recibe un webhook de
// Supabase cada vez que se inserta una fila en "notificaciones". Así queda
// cubierto cualquier camino por el que se resuelva una solicitud (panel de
// RR.HH., equipo del jefe, enlace del correo, cancelación de RR.HH.) sin
// tocar cada uno por separado.
//
// Solo actúa sobre estos relacionado_tipo (los avisos al TRABAJADOR; los
// avisos de "nueva solicitud" a jefes usan otros tipos y no se tocan):
//   solicitud_permiso, solicitud_permiso_cancelada, solicitud_vacaciones

import { enviarCorreo } from '@/lib/enviarCorreo';
import { correoSolicitudResuelta, correoPapeletaFirma } from '@/lib/plantillasCorreo';

const TIPOS = {
  solicitud_permiso: 'permiso',
  solicitud_permiso_cancelada: 'permiso',
  solicitud_vacaciones: 'vacaciones',
  // Aviso de que la papeleta aprobada está lista para firmar (botón "Notificar").
  papeleta_firma_permiso: 'permiso',
  papeleta_firma_vacaciones: 'vacaciones',
};

function fechaLarga(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function enviarCorreoResultadoSolicitud(admin, record) {
  const tipo = TIPOS[record?.relacionado_tipo];
  if (!tipo || !record.relacionado_id || !record.trabajador_id) return { omitido: true };

  const tabla = tipo === 'permiso' ? 'solicitudes_permiso' : 'solicitudes_vacaciones';
  const { data: solicitud } = await admin
    .from(tabla)
    .select('*')
    .eq('id', record.relacionado_id)
    .maybeSingle();
  if (!solicitud) return { omitido: true };

  // El aviso va a la persona dueña de la solicitud.
  if (solicitud.trabajador_id !== record.trabajador_id) return { omitido: true };

  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('email')
    .eq('id', solicitud.trabajador_id)
    .maybeSingle();
  if (!trabajador?.email) return { omitido: true };

  const rango =
    solicitud.fecha_desde === solicitud.fecha_hasta
      ? `el ${fechaLarga(solicitud.fecha_desde)}`
      : `desde el ${fechaLarga(solicitud.fecha_desde)} hasta el ${fechaLarga(solicitud.fecha_hasta)}`;

  let detalle;
  if (tipo === 'vacaciones') {
    const dias = solicitud.dias_habiles;
    detalle = `Vacaciones ${rango}${dias != null ? ` (${dias} ${Number(dias) === 1 ? 'día hábil' : 'días hábiles'})` : ''}.`;
  } else {
    let nombreTipo = 'Permiso';
    if (solicitud.tipo_permiso_id) {
      const { data: tp } = await admin
        .from('tipos_permiso')
        .select('nombre')
        .eq('id', solicitud.tipo_permiso_id)
        .maybeSingle();
      if (tp?.nombre) nombreTipo = tp.nombre;
    }
    const horas =
      solicitud.hora_desde && solicitud.hora_hasta
        ? `, de ${solicitud.hora_desde.slice(0, 5)} a ${solicitud.hora_hasta.slice(0, 5)} hrs`
        : '';
    detalle = `${nombreTipo} ${rango}${horas}.`;
  }

  const esAvisoPapeleta = String(record.relacionado_tipo).startsWith('papeleta_firma');
  const { subject, html } = esAvisoPapeleta
    ? correoPapeletaFirma({ tipo, detalle })
    : correoSolicitudResuelta({
        tipo,
        estado: solicitud.estado,
        detalle,
        comentario: solicitud.estado === 'cancelada' ? solicitud.comentario_resolucion : null,
      });

  return enviarCorreo({ to: trabajador.email, subject, html });
}
