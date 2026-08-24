import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Guarda la URL de la foto de perfil o del banner que la persona acaba de
// subir a Storage. Usa la llave de servicio, pero valida el token de sesión
// que manda el navegador para saber DE QUIÉN es realmente esa sesión —
// así cada quien solo puede cambiar su propia foto, nunca la de otro.
export async function POST(req) {
  const body = await req.json();
  const { tipo, url } = body;

  if (tipo !== 'avatar' && tipo !== 'banner') {
    return NextResponse.json({ error: 'Tipo inválido: debe ser "avatar" o "banner".' }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: 'Falta la URL de la imagen.' }, { status: 400 });
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' },
      { status: 500 }
    );
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 });
  }

  const columna = tipo === 'avatar' ? 'avatar_url' : 'banner_url';
  const { error: updateError } = await admin
    .from('trabajadores')
    .update({ [columna]: url })
    .eq('id', userData.user.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
