import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  const body = await req.json();

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

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(body.email);
  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const userId = invited.user.id;

  const { error: insertError } = await admin.from('trabajadores').insert({
    id: userId,
    nombre_completo: body.nombre_completo,
    rut: body.rut,
    email: body.email,
    cargo: body.cargo || null,
    area_id: body.area_id || null,
    jefe_directo_id: body.jefe_directo_id || null,
    fecha_ingreso: body.fecha_ingreso,
    fecha_nacimiento: body.fecha_nacimiento || null,
    tipo_contrato: body.tipo_contrato || null,
    registra_asistencia: body.registra_asistencia || null,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  if (body.roles?.length) {
    await admin
      .from('trabajador_roles')
      .insert(body.roles.map((r) => ({ trabajador_id: userId, rol: r })));
  }

  if (body.dias_pendientes_base != null) {
    await admin.from('vacaciones_saldo_inicial').insert({
      trabajador_id: userId,
      fecha_corte: new Date().toISOString().slice(0, 10),
      dias_pendientes_base: body.dias_pendientes_base,
      dias_progresivos_reconocidos: body.dias_progresivos_reconocidos || 0,
    });
  }

  return NextResponse.json({ ok: true });
}
