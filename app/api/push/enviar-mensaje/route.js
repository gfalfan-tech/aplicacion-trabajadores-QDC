import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Endpoint que llama el Database Webhook de Supabase cada vez que se
// inserta un mensaje nuevo en "mensajes". Antes de esto el chat no
// mandaba ninguna notificación push — solo se veía el numerito rojo
// dentro de la app. Ahora también le llega un push real (con su
// número de pendientes actualizado en el ícono) a cada participante de
// la conversación, salvo a quien escribió el mensaje.
//
// Configurar en Supabase: Database → Webhooks → nuevo webhook
//   - Tabla: mensajes
//   - Evento: Insert
//   - Tipo: HTTP Request → POST a la URL de este endpoint
//     (https://TU-DOMINIO/api/push/enviar-mensaje)
//   - HTTP Headers: agregar "x-webhook-secret: <mismo valor que PUSH_WEBHOOK_SECRET en Vercel>"

const MAX_LARGO_CUERPO = 120;

export async function POST(req) {
  const secretEsperado = process.env.PUSH_WEBHOOK_SECRET;
  if (secretEsperado) {
    const recibido = req.headers.get('x-webhook-secret');
    if (recibido !== secretEsperado) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';

  if (!vapidPublic || !vapidPrivate || !serviceKey) {
    return NextResponse.json(
      { error: 'Faltan variables de entorno (VAPID o SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500 }
    );
  }

  webpush.setVapidDetails('mailto:soporte@qdc.cl', vapidPublic, vapidPrivate);
  const admin = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => null);
  const record = body?.record;
  if (!record?.conversacion_id || !record?.trabajador_id) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { data: participantes } = await admin
    .from('conversaciones_participantes')
    .select('trabajador_id')
    .eq('conversacion_id', record.conversacion_id)
    .neq('trabajador_id', record.trabajador_id);

  if (!participantes || participantes.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0 });
  }

  const { data: autor } = await admin
    .from('trabajadores')
    .select('nombre_completo')
    .eq('id', record.trabajador_id)
    .maybeSingle();

  const cuerpo =
    (record.texto || '').length > MAX_LARGO_CUERPO
      ? `${record.texto.slice(0, MAX_LARGO_CUERPO)}…`
      : record.texto || '';

  let enviados = 0;
  const vencidos = [];

  await Promise.all(
    participantes.map(async (p) => {
      const { data: suscripciones } = await admin
        .from('push_subscriptions')
        .select('*')
        .eq('trabajador_id', p.trabajador_id);
      if (!suscripciones || suscripciones.length === 0) return;

      const { data: badgeCount } = await admin.rpc('fn_contador_badge', {
        p_trabajador_id: p.trabajador_id,
      });

      const payload = JSON.stringify({
        titulo: autor?.nombre_completo || 'Nuevo mensaje',
        cuerpo,
        url: '/mensajes',
        tag: `mensaje-${record.conversacion_id}`,
        badgeCount: badgeCount || 0,
      });

      await Promise.all(
        suscripciones.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload
            );
            enviados += 1;
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              vencidos.push(s.endpoint);
            }
          }
        })
      );
    })
  );

  if (vencidos.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', vencidos);
  }

  return NextResponse.json({ ok: true, enviados, vencidos: vencidos.length });
}
