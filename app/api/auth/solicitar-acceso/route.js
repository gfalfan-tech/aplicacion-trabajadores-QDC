import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Le envía a alguien un correo con un link para crear su contraseña —
// sirve tanto para "olvidé mi contraseña" como para "es mi primera vez y
// nunca me llegó (o venció) el correo de invitación". No requiere estar
// autenticado: cualquiera puede escribir un correo acá, por eso primero
// se valida que ese correo SÍ corresponda a un trabajador ya creado por
// RR.HH. — si no, se avisa explícitamente en vez de mandar nada.
export async function POST(req) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = (body?.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Ingresa tu correo.' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (!trabajador) {
    return NextResponse.json(
      { error: 'Ese correo no está registrado en Gestión RRHH. Contacta a RR.HH. para que te creen una cuenta.' },
      { status: 404 }
    );
  }

  const origin = new URL(req.url).origin;
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/crear-clave`,
  });

  if (error) {
    return NextResponse.json({ error: 'No se pudo enviar el correo: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
