// Envía un correo electrónico vía la API de Resend.
// Requiere la variable de entorno RESEND_API_KEY (en Vercel).
//
// Uso:
//   import { enviarCorreo } from '@/lib/enviarCorreo';
//   await enviarCorreo({ to: 'jefe@empresa.cl', subject: '...', html: '...' });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'QDC Notificaciones <onboarding@resend.dev>';

/**
 * @param {{ to: string, subject: string, html: string }} opts
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function enviarCorreo({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('[enviarCorreo] RESEND_API_KEY no configurada — correo omitido.');
    return { ok: false, error: 'RESEND_API_KEY no configurada.' };
  }

  if (!to) {
    console.warn('[enviarCorreo] Sin dirección de destino — correo omitido.');
    return { ok: false, error: 'Sin dirección de destino.' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    if (!res.ok) {
      const texto = await res.text();
      console.error(`[enviarCorreo] Error Resend (${res.status}):`, texto);
      return { ok: false, error: texto };
    }

    return { ok: true };
  } catch (e) {
    console.error('[enviarCorreo] Excepción:', e);
    return { ok: false, error: String(e) };
  }
}
