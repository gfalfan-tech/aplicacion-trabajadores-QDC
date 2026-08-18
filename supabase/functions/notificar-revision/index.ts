// Edge Function: notificar-revision
//
// La llama la app justo después de crear una solicitud de permiso o de
// vacaciones. Busca al jefe directo del trabajador (o a alguien de RRHH si
// no tiene jefe asignado), genera un token de revisión y le envía un correo
// con un enlace para aprobar/rechazar la solicitud sin iniciar sesión.
//
// Requiere estas variables de entorno (Project Settings → Edge Functions →
// Secrets en el dashboard de Supabase):
//   RESEND_API_KEY   - API key de Resend
//   SITE_URL         - URL pública de la app, ej: https://aplicacion-trabajadores-qdc.vercel.app
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen dados por Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SITE_URL = Deno.env.get('SITE_URL') || 'https://aplicacion-trabajadores-qdc.vercel.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatFechaCorta(fechaISO: string) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return jsonResponse({ ok: false, error: 'No autenticado.' }, 401);

    const { tipo, solicitud_id } = await req.json();
    if (!['permiso', 'vacaciones'].includes(tipo) || !solicitud_id) {
      return jsonResponse({ ok: false, error: 'Parámetros inválidos.' }, 400);
    }

    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

    // Verifica al usuario dueño del JWT (con el cliente admin, pasándole el token).
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return jsonResponse({ ok: false, error: 'No autenticado.' }, 401);
    }
    const uid = userData.user.id;

    const tabla = tipo === 'permiso' ? 'solicitudes_permiso' : 'solicitudes_vacaciones';
    const { data: solicitud, error: solicitudError } = await admin
      .from(tabla)
      .select('*')
      .eq('id', solicitud_id)
      .maybeSingle();

    if (solicitudError || !solicitud) {
      return jsonResponse({ ok: false, error: 'Solicitud no encontrada.' }, 404);
    }
    if (solicitud.trabajador_id !== uid) {
      return jsonResponse({ ok: false, error: 'No autorizado.' }, 403);
    }

    const { data: trabajador } = await admin
      .from('trabajadores')
      .select('nombre_completo, rut, jefe_directo_id')
      .eq('id', uid)
      .maybeSingle();

    let revisor: { id: string; nombre_completo: string; email: string } | null = null;

    if (trabajador?.jefe_directo_id) {
      const { data: jefe } = await admin
        .from('trabajadores')
        .select('id, nombre_completo, email')
        .eq('id', trabajador.jefe_directo_id)
        .maybeSingle();
      if (jefe?.email) revisor = jefe;
    }

    if (!revisor) {
      const { data: rolesRRHH } = await admin
        .from('trabajador_roles')
        .select('trabajador_id')
        .eq('rol', 'rrhh')
        .limit(1);
      const rrhhId = rolesRRHH?.[0]?.trabajador_id;
      if (rrhhId) {
        const { data: rrhh } = await admin
          .from('trabajadores')
          .select('id, nombre_completo, email')
          .eq('id', rrhhId)
          .maybeSingle();
        if (rrhh?.email) revisor = rrhh;
      }
    }

    if (!revisor) {
      return jsonResponse(
        { ok: false, error: 'No hay jefe directo ni RRHH con correo para notificar.' },
        422
      );
    }

    const rpcFn = tipo === 'permiso' ? 'generar_token_revision_permiso' : 'generar_token_revision_vacaciones';
    const { data: token, error: tokenError } = await admin.rpc(rpcFn, {
      p_solicitud_id: solicitud_id,
      p_revisor_id: revisor.id,
    });
    if (tokenError || !token) {
      return jsonResponse({ ok: false, error: 'No se pudo generar el enlace de revisión.' }, 500);
    }

    const enlace = `${SITE_URL}/revisar/${tipo}/${token}`;
    const nombreTrabajador = trabajador?.nombre_completo || 'Un trabajador';

    let asunto: string;
    let detalle: string;
    if (tipo === 'permiso') {
      asunto = `Solicitud de permiso de ${nombreTrabajador}`;
      const horas =
        solicitud.hora_desde && solicitud.hora_hasta
          ? ` entre las ${solicitud.hora_desde.slice(0, 5)} y las ${solicitud.hora_hasta.slice(0, 5)} horas`
          : '';
      detalle = `Solicita permiso el ${formatFechaCorta(solicitud.fecha_desde)}${
        solicitud.fecha_desde !== solicitud.fecha_hasta ? ` hasta el ${formatFechaCorta(solicitud.fecha_hasta)}` : ''
      }${horas}.`;
    } else {
      asunto = `Solicitud de vacaciones de ${nombreTrabajador}`;
      detalle = `Solicita vacaciones desde el ${formatFechaCorta(solicitud.fecha_desde)} hasta el ${formatFechaCorta(
        solicitud.fecha_hasta
      )} (${solicitud.dias_habiles} días hábiles).`;
    }

    if (!RESEND_API_KEY) {
      return jsonResponse({ ok: false, error: 'Falta configurar RESEND_API_KEY.' }, 500);
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#153A5B;">Portal QDC</h2>
        <p><strong>${nombreTrabajador}</strong> te envió una solicitud para revisar:</p>
        <p style="background:#F1F5F9; padding:12px; border-radius:8px;">${detalle}</p>
        <p>
          <a href="${enlace}" style="background:#0F5C8C; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:bold;">
            Revisar solicitud
          </a>
        </p>
        <p style="font-size:12px; color:#64748B;">Este enlace no requiere iniciar sesión y vence en 7 días.</p>
      </div>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'QDC Notificaciones <onboarding@resend.dev>',
        to: [revisor.email],
        subject: asunto,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      return jsonResponse({ ok: false, error: `Error enviando correo: ${errBody}` }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
