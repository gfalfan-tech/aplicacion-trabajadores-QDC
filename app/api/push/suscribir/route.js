import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Guarda o elimina la suscripción a notificaciones push de este
// dispositivo/navegador para el trabajador autenticado.

function clienteAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

async function usuarioDesdeToken(admin, req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function POST(req) {
  const admin = clienteAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' },
      { status: 500 }
    );
  }

  const user = await usuarioDesdeToken(admin, req);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const suscripcion = await req.json().catch(() => null);
  const endpoint = suscripcion?.endpoint;
  const p256dh = suscripcion?.keys?.p256dh;
  const authKey = suscripcion?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Suscripción inválida.' }, { status: 400 });
  }

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      trabajador_id: user.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: req.headers.get('user-agent') || null,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const admin = clienteAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' },
      { status: 500 }
    );
  }

  const user = await usuarioDesdeToken(admin, req);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: 'Falta el endpoint.' }, { status: 400 });
  }

  await admin
    .from('push_subscriptions')
    .delete()
    .eq('trabajador_id', user.id)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
}
