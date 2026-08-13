import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Falta el id del trabajador.' }, { status: 400 });
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      {
        error:
          'Falta configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel (Project Settings → Environment Variables).',
      },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Al borrar el usuario de auth, la fila en "trabajadores" (y todo lo que
  // depende de ella: solicitudes, saldo de vacaciones, etc.) se elimina en
  // cascada automáticamente por las relaciones definidas en el esquema.
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}