// Plantillas HTML de correo para notificaciones de caja chica y rendición
// de gastos. Siguen el mismo estilo visual que la Edge Function
// notificar-revision (permisos/vacaciones).

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://aplicacion-trabajadores-qdc.vercel.app';

function formatearCLP(monto) {
  return '$' + Number(monto).toLocaleString('es-CL');
}

function envolver(contenido) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#153A5B;">Gestión RRHH</h2>
      ${contenido}
      <p style="font-size:12px; color:#64748B; margin-top:24px;">
        Este es un mensaje automático del sistema de gestión QDC.
      </p>
    </div>
  `;
}

function botonRevisar(enlace) {
  return `
    <p style="margin-top:16px;">
      <a href="${enlace}" style="background:#0F5C8C; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:bold;">
        Revisar solicitud
      </a>
    </p>
    <p style="font-size:12px; color:#64748B;">Este enlace no requiere iniciar sesión y vence en 7 días.</p>
  `;
}

// ---------------------------------------------------------------------------
// CAJA CHICA
// ---------------------------------------------------------------------------

/**
 * Correo al aprobador cuando llega una nueva solicitud de caja chica.
 * Incluye botón para aprobar/rechazar desde el correo.
 */
export function correoCajaChicaNueva({ nombreSolicitante, monto, articulo, razon, token }) {
  const enlace = `${SITE_URL}/revisar/caja-chica/${token}`;
  return {
    subject: `Solicitud de caja chica de ${nombreSolicitante}`,
    html: envolver(`
      <p><strong>${nombreSolicitante}</strong> solicita fondos de caja chica:</p>
      <div style="background:#F1F5F9; padding:12px; border-radius:8px; margin:12px 0;">
        <p style="margin:4px 0;"><strong>Monto:</strong> ${formatearCLP(monto)}</p>
        <p style="margin:4px 0;"><strong>Artículo:</strong> ${articulo}</p>
        <p style="margin:4px 0;"><strong>Razón:</strong> ${razon}</p>
      </div>
      ${botonRevisar(enlace)}
    `),
  };
}

/**
 * Correo informativo al solicitante cuando su solicitud fue aprobada o rechazada.
 */
export function correoCajaChicaResuelta({ monto, articulo, aprobada, motivoRechazo }) {
  const estado = aprobada ? 'aprobada ✅' : 'rechazada ❌';
  return {
    subject: `Tu solicitud de caja chica fue ${aprobada ? 'aprobada' : 'rechazada'}`,
    html: envolver(`
      <p>Tu solicitud de caja chica fue <strong>${estado}</strong>.</p>
      <div style="background:#F1F5F9; padding:12px; border-radius:8px; margin:12px 0;">
        <p style="margin:4px 0;"><strong>Monto:</strong> ${formatearCLP(monto)}</p>
        <p style="margin:4px 0;"><strong>Artículo:</strong> ${articulo}</p>
        ${!aprobada && motivoRechazo ? `<p style="margin:4px 0;"><strong>Motivo:</strong> ${motivoRechazo}</p>` : ''}
      </div>
      ${aprobada
        ? '<p>RR.HH. se encargará de la entrega del dinero. Recuerda que luego deberás hacer la rendición con comprobantes.</p>'
        : '<p>Favor dirigirse personalmente con su jefatura.</p>'}
      <p style="margin-top:12px;">
        <a href="${SITE_URL}" style="color:#0F5C8C; font-weight:bold; text-decoration:none;">Ir a la app →</a>
      </p>
    `),
  };
}

// ---------------------------------------------------------------------------
// RENDICIÓN DE GASTOS
// ---------------------------------------------------------------------------

/**
 * Correo al revisor cuando llega una rendición de gastos para aprobar.
 * Incluye botón para aprobar/rechazar desde el correo.
 */
export function correoRendicionNueva({ nombreTrabajador, totalGastos, moneda, etapa, token }) {
  const enlace = `${SITE_URL}/revisar/rendicion-gastos/${token}`;
  const montoTexto = moneda === 'USD' ? `US$${Number(totalGastos).toLocaleString('es-CL')}` : formatearCLP(totalGastos);
  const etapaTexto = etapa === 'finanzas'
    ? 'Ya fue aprobada por el jefe directo. Ahora necesita la aprobación de Finanzas.'
    : '';
  return {
    subject: `Rendición de gastos de ${nombreTrabajador}`,
    html: envolver(`
      <p><strong>${nombreTrabajador}</strong> envió una rendición de gastos para tu revisión:</p>
      <div style="background:#F1F5F9; padding:12px; border-radius:8px; margin:12px 0;">
        <p style="margin:4px 0;"><strong>Total gastos:</strong> ${montoTexto}</p>
        ${etapaTexto ? `<p style="margin:4px 0; font-size:13px; color:#475569;">${etapaTexto}</p>` : ''}
      </div>
      ${botonRevisar(enlace)}
    `),
  };
}

/**
 * Correo informativo al trabajador cuando su rendición fue resuelta.
 */
export function correoRendicionResuelta({ estado, etapa }) {
  // estado: 'aprobada_jefe', 'aprobada', 'rechazada'
  let titulo, mensaje;

  if (estado === 'aprobada_jefe') {
    titulo = 'Tu rendición de gastos avanza';
    mensaje = 'Tu jefe directo aprobó tu rendición de gastos. Ahora está a la espera de la firma de Finanzas.';
  } else if (estado === 'aprobada') {
    titulo = 'Tu rendición de gastos fue aprobada ✅';
    mensaje = 'Tu rendición de gastos fue aprobada en su totalidad.';
  } else {
    titulo = 'Tu rendición de gastos fue rechazada ❌';
    mensaje = 'Tu rendición de gastos no fue autorizada. Favor dirigirse personalmente con su jefatura.';
  }

  return {
    subject: titulo,
    html: envolver(`
      <p>${mensaje}</p>
      <p style="margin-top:12px;">
        <a href="${SITE_URL}" style="color:#0F5C8C; font-weight:bold; text-decoration:none;">Ir a la app →</a>
      </p>
    `),
  };
}
