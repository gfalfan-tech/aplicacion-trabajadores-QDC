import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { rutaDeNotificacion } from '@/lib/notificacionesRuta';

// Endpoint que llama el Database Webhook de Supabase cada vez que se
// inserta una fila nueva en "notificaciones". Envía un push real a todos
// los dispositivos suscritos de ese trabajador.
//
// Configurar en Supabase: Database → Webhooks → nuevo webhook
//   - Tabla: notificaciones
//   - Evento: Insert
//   - Tipo: HTTP Request → POST a la URL de este endpoint
//     (https://TU-DOMINIO/api/push/enviar)
//   - HTTP Headers: agregar "x-webhook-secret: <mismo valor que PUSH_WEBHOOK_SECRET en Vercel>"

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
  if (!record?.trabajador_id) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { data: suscripciones } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('trabajador_id', record.trabajador_id);

  if (!suscripciones || suscripciones.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0 });
  }

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', record.trabajador_id);
  const esRRHH = (rolesData || []).some((r) => r.rol === 'rrhh' || r.rol === 'administrador');
  const url = rutaDeNotificacion(record, { esRRHH }) || '/';

  // Cuántos pendientes sin leer tiene la persona en este momento
  // (notificaciones + mensajes) — viaja en el push para que el service
  // worker pueda mostrar ese número como "badge" sobre el ícono de la
  // app, incluso con la app cerrada.
  const { data: badgeCount } = await admin.rpc('fn_contador_badge', {
    p_trabajador_id: record.trabajador_id,
  });

  const payload = JSON.stringify({
    titulo: record.titulo || 'Portal QDC',
    cuerpo: record.cuerpo || '',
    url,
    tag: record.relacionado_tipo || undefined,
    badgeCount: badgeCount || 0,
  });

  let enviados = 0;
  const vencidos = [];

  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
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

  if (vencidos.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', vencidos);
  }

  return NextResponse.json({ ok: true, enviados, vencidos: vencidos.length });
}
